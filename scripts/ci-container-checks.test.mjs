import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkLanes,
  runLanes,
  cleanupProjects,
} from "./ci-container-checks.mjs";

const task = (name, source) => ({
  name,
  command: process.execPath,
  args: ["--input-type=module", "-e", source],
});
test("native platforms retain all container checks in at most two lanes", () => {
  assert.deepEqual(
    checkLanes("amd64").map((lane) => lane.map(({ name }) => name)),
    [
      ["image-smoke", "upgrade"],
      ["staging-smoke", "preview-smoke"],
    ],
  );
  assert.equal(checkLanes("arm64").length, 1);
  assert.throws(() => checkLanes("unknown"));
});

test("lanes overlap but commands within a lane stay ordered, with complete logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "ci-lanes-"));
  const marker = join(root, "first");
  try {
    const first = task(
      "first",
      `import{writeFile,access}from'node:fs/promises';await writeFile(${JSON.stringify(marker)},'ready');for(let i=0;i<100;i++){try{await access(${JSON.stringify(join(root, "second"))});console.log('overlap');process.exit(0)}catch{}await new Promise(r=>setTimeout(r,20))}process.exit(1)`,
    );
    const second = task(
      "second",
      `import{writeFile,access}from'node:fs/promises';for(let i=0;i<100;i++){try{await access(${JSON.stringify(marker)});await writeFile(${JSON.stringify(join(root, "second"))},'ready');console.error('stderr retained');process.exit(0)}catch{}await new Promise(r=>setTimeout(r,20))}process.exit(1)`,
    );
    const after = task(
      "after",
      `import{access}from'node:fs/promises';await access(${JSON.stringify(marker)});console.log('ordered')`,
    );
    const result = await runLanes([[first, after], [second]], { logDir: root });
    assert.equal(result.code, 0);
    assert.equal(result.results.length, 3);
    assert.match(await readFile(join(root, "first.log"), "utf8"), /overlap/);
    assert.match(
      await readFile(join(root, "second.log"), "utf8"),
      /stderr retained/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed check skips its dependent command and fails the aggregate", async () => {
  const root = await mkdtemp(join(tmpdir(), "ci-lanes-"));
  try {
    const result = await runLanes(
      [
        [
          task("broken", "process.exit(7)"),
          task("unreachable", "process.exit(0)"),
        ],
        [task("independent", "console.log('pass')")],
      ],
      { logDir: root },
    );
    assert.equal(result.code, 1);
    assert.deepEqual(result.results.map(({ name }) => name).sort(), [
      "broken",
      "independent",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancellation stops running checks and never starts later commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "ci-lanes-"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    const result = await runLanes(
      [
        [
          task("waiting", "setInterval(()=>{},1000)"),
          task("unreachable", "process.exit(0)"),
        ],
      ],
      { logDir: root, signal: controller.signal },
    );
    assert.equal(result.code, 130);
    assert.deepEqual(
      result.results.map(({ name }) => name),
      ["waiting"],
    );
  } finally {
    clearTimeout(timer);
    await rm(root, { recursive: true, force: true });
  }
});

test("fallback cleanup only removes objects belonging to registered disposable projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "ci-projects-"));
  const file = join(root, "projects");
  const calls = [];
  try {
    await writeFile(file, "disposable-test\ndisposable-test\n");
    await cleanupProjects(file, (_command, args) => {
      calls.push(args);
      return {
        status: 0,
        stdout: args.includes("--filter") ? "owned-id\n" : "",
      };
    });
    assert.equal(calls.length, 6);
    assert.ok(
      calls
        .filter((args) => args.includes("--filter"))
        .every(
          (args) =>
            args.at(-1) === "label=com.docker.compose.project=disposable-test",
        ),
    );
    assert.deepEqual(
      calls
        .filter((args) => !args.includes("--filter"))
        .map((args) => args.at(-1)),
      ["owned-id", "owned-id", "owned-id"],
    );
    await writeFile(file, "--unsafe\n");
    await assert.rejects(cleanupProjects(file), /Invalid disposable/);
    await writeFile(file, "disposable-test\n");
    await assert.rejects(
      cleanupProjects(file, () => ({ status: 1 })),
      /Cannot list/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

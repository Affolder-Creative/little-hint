import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  cp,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  parseArgs,
  checkoutIdentity,
  dockerEnvironment,
  newState,
  validateState,
  runtimeConfiguration,
  envFile,
  publishedPort,
  tunnelURL,
  gatewayConfiguration,
  dataVolumes,
  newContainers,
} from "./preview/config.mjs";
import { acquireLock } from "./preview.mjs";

test("arguments reject unknown/destructive combinations", () => {
  assert.deepEqual(parseArgs(["start", "--share"]), {
    command: "start",
    share: true,
    yes: false,
  });
  assert.equal(parseArgs(["reset", "--yes"]).yes, true);
  for (const args of [
    ["--share"],
    ["stop", "--yes"],
    ["start", "--reset"],
    ["reset", "--share"],
    ["start", "--share", "--share"],
  ])
    assert.throws(() => parseArgs(args));
});
test("checkout identity is stable, path-specific and safe for Compose", () => {
  assert.equal(checkoutIdentity("/work/A"), checkoutIdentity("/work/A"));
  assert.notEqual(checkoutIdentity("/work/A"), checkoutIdentity("/work/B"));
  assert.match(
    checkoutIdentity("/spaces/hello world"),
    /^little-hint-preview-[a-f0-9]{16}$/,
  );
  assert.throws(() => validateState(newState("/a"), "/b"));
});
test("only Docker client settings cross the process boundary", () => {
  const input = {
    PATH: "/bin",
    HOME: "/home/me",
    DOCKER_HOST: "unix:///socket",
    DOCKER_CONTEXT: "orb",
    SSH_AUTH_SOCK: "/ssh",
    APP_URL: "https://real.example",
    NODE_OPTIONS: "--import malicious",
    COMPOSE_FILE: "compose.yaml",
    COMPOSE_ENV_FILES: ".env",
    PREVIEW_DB_PASSWORD: "real",
    OPENAI_API_KEY: "real",
    DATABASE_URL: "real",
    SMTP_PASS: "real",
    HTTP_PROXY: "real",
  };
  assert.deepEqual(dockerEnvironment(input), {
    PATH: "/bin",
    HOME: "/home/me",
    DOCKER_HOST: "unix:///socket",
    DOCKER_CONTEXT: "orb",
    SSH_AUTH_SOCK: "/ssh",
  });
  const state = newState("/a");
  const env = runtimeConfiguration(state, "http://localhost:49123");
  assert.equal(env.APP_ENV, "preview");
  assert.equal(env.NODE_ENV, "production");
  assert.match(env.DATABASE_URL, /@db:5432\/little_hint_preview$/);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.SMTP_PASS, undefined);
  assert.equal(env.CLOUDFLARE_WEB_ANALYTICS, "false");
  assert.throws(() => envFile({ BAD: "$(oops)" }));
  assert.throws(() => runtimeConfiguration(state, "http://example.com"));
});
test("Docker chooses a loopback port; malformed/non-loopback results are refused", () => {
  assert.equal(publishedPort("127.0.0.1:49152\n"), 49152);
  for (const output of [
    "0.0.0.0:1234",
    "127.0.0.1:0",
    "127.0.0.1:65536",
    "garbage",
  ])
    assert.throws(() => publishedPort(output));
});
test("only generated Quick Tunnel HTTPS origins are accepted", () => {
  assert.equal(
    tunnelURL("INF | https://small-blue-hint.trycloudflare.com |"),
    "https://small-blue-hint.trycloudflare.com",
  );
  for (const log of [
    "https://api.trycloudflare.com.evil.test",
    "http://foo.trycloudflare.com",
    "https://foo.example.com",
  ])
    assert.equal(tunnelURL(log), undefined);
});
test("gateway keeps inbox prefix, prevents caching, and enforces the session origin", () => {
  const config = gatewayConfiguration("https://new-origin.trycloudflare.com");
  assert.match(config, /handle \/__preview\/inbox\/\*/);
  assert.doesNotMatch(config, /handle_path/);
  assert.match(config, /Cache-Control "no-store"/);
  assert.match(
    config,
    /redir @other https:\/\/new-origin.trycloudflare.com\{uri\} 307/,
  );
});
test("concurrent operations fail without stealing the lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-lock-"));
  try {
    const release = await acquireLock(directory);
    await assert.rejects(acquireLock(directory), /Another preview operation/);
    await release();
    await (
      await acquireLock(directory)
    )();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("cleanup selects only new container IDs; reset names only the three preview volumes", () => {
  assert.deepEqual(
    newContainers(["old-db"], ["old-db", "new-app", "new-tunnel"]),
    ["new-app", "new-tunnel"],
  );
  assert.deepEqual(dataVolumes("preview-a"), [
    "preview-a_database",
    "preview-a_uploads",
    "preview-a_mail",
  ]);
});

// Execute the real launcher against a tiny Docker command double, in a separate
// checkout. No test can accidentally call the developer's Docker daemon.
async function fixture(t, scenario = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "preview-cli-")));
  await mkdir(join(root, "bin"));
  await cp(
    new URL("./preview.mjs", import.meta.url),
    join(root, "scripts/preview.mjs"),
    { recursive: true },
  );
  await cp(
    new URL("./preview", import.meta.url),
    join(root, "scripts/preview"),
    { recursive: true },
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "1.2.3", type: "module" }),
  );
  await writeFile(
    join(root, ".env"),
    "DATABASE_URL=production-secret\nOPENAI_API_KEY=production-secret",
  );
  const server = createServer((req, res) => {
    res.end(req.url === "/api/health" ? '{"app":"little-hint"}' : "Mailpit");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await writeFile(
    join(root, "fake.json"),
    JSON.stringify({
      ids: [],
      volumes: [],
      ...scenario,
      port: server.address().port,
    }),
  );
  const fake = `#!${process.execPath}
import fs from 'node:fs';
const a=process.argv.slice(2), s=JSON.parse(fs.readFileSync('fake.json','utf8'));
fs.appendFileSync('calls.jsonl',JSON.stringify({args:a,env:process.env})+'\\n');
const save=()=>fs.writeFileSync('fake.json',JSON.stringify(s));
const out=x=>console.log(x);
if(a[0]==='info'&&s.fail==='docker'){out('Docker is not running');process.exit(1);}
if(a[0]==='ps')out(s.ids.join('\\n'));
if(a[0]==='network'&&a[1]==='ls')out((s.networks||[]).join('\\n'));
if(a[0]==='network'&&a[1]==='rm'){s.networks=s.networks.filter(id=>!a.includes(id));save();}
if(a[0]==='volume'&&a[1]==='ls')out((a.some(v=>v.startsWith('label='))?(s.ownedVolumes??s.volumes):s.volumes).join('\\n'));
if(a[0]==='volume'&&a[1]==='rm'){s.volumes=s.volumes.filter(v=>!a.includes(v));save();}
if(a[0]==='rm'){s.ids=s.ids.filter(id=>!a.includes(id));save();}
if(a[0]==='compose'){
 const c=a.slice(a.indexOf('tools')+1);
 if(c[0]==='build'&&s.fail==='build'){out('build failed');process.exit(1);}
 if(c[0]==='up'){for(const name of ['db','mailpit','gateway','app','worker','tunnel'].filter(n=>c.includes(n)))if(!s.ids.includes(name))s.ids.push(name);s.networks??=['new-network'];save();if(s.fail==='port'){out('port is already allocated');process.exit(1);}}
 if(c[0]==='port')out('127.0.0.1:'+s.port);
 if(c[0]==='ps'&&s.fail==='tunnel')out('{"State":"exited"}');
 if(c[0]==='run'&&c.includes('ensure-preview')){if(s.fail==='migrate'){out('migration failed '+JSON.parse(fs.readFileSync('.local/preview/state.json','utf8')).databasePassword);process.exit(1);}s.seeded??=1;save();}
}
`;
  await writeFile(join(root, "bin/docker"), fake, { mode: 0o755 });
  t.after(async () => {
    server.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    run: (args) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/preview.mjs", ...args],
          {
            cwd: root,
            env: {
              PATH: `${join(root, "bin")}:${dirname(process.execPath)}`,
              HOME: root,
              OPENAI_API_KEY: "shell-secret",
              APP_URL: "https://production.example",
              PREVIEW_DB_PASSWORD: "shell-secret",
            },
          },
        );
        let output = "";
        child.stdout.on("data", (b) => (output += b));
        child.stderr.on("data", (b) => (output += b));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, output }));
      }),
    calls: async () =>
      (await readFile(join(root, "calls.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse),
    state: async () =>
      JSON.parse(
        await readFile(join(root, ".local/preview/state.json"), "utf8"),
      ),
  };
}
test("first and repeated startup retain secrets, isolate .env and report actual URLs", async (t) => {
  const f = await fixture(t);
  const first = await f.run(["start"]);
  assert.equal(first.code, 0, first.output);
  const state = await f.state();
  const second = await f.run(["start"]);
  assert.equal(second.code, 0, second.output);
  assert.deepEqual(await f.state(), state);
  assert.match(second.output, /http:\/\/localhost:/);
  assert.doesNotMatch(
    first.output + second.output,
    new RegExp(state.authSecret),
  );
  const runtime = await readFile(
    join(f.root, ".local/preview/runtime.env"),
    "utf8",
  );
  assert.doesNotMatch(runtime, /production-secret|shell-secret/);
  for (const call of await f.calls()) {
    assert.equal(call.env.OPENAI_API_KEY, undefined);
    if (call.args[0] === "compose" && call.args[1] !== "version") {
      assert.ok(call.args.includes("--env-file"));
      assert.ok(call.args.includes(checkoutIdentity(f.root)));
    }
  }
});
for (const fail of ["build", "migrate", "tunnel", "port"])
  test(`${fail} failure cleans only resources created by that attempt`, async (t) => {
    const f = await fixture(t, { fail, ids: ["old-db"] });
    // Existing configuration is necessary when a container already exists.
    await mkdir(join(f.root, ".local/preview"), { recursive: true });
    await writeFile(
      join(f.root, ".local/preview/state.json"),
      JSON.stringify(newState(f.root)),
    );
    const result = await f.run([
      "start",
      ...(fail === "tunnel" ? ["--share"] : []),
    ]);
    assert.notEqual(result.code, 0);
    assert.ok(!result.output.includes((await f.state()).databasePassword));
    const calls = await f.calls();
    const removed = calls
      .filter((c) => c.args[0] === "rm")
      .flatMap((c) => c.args.slice(2));
    assert.ok(!removed.includes("old-db"));
    if (fail === "build") assert.equal(removed.length, 0);
    else {
      assert.ok(removed.includes("gateway"));
      assert.ok(
        calls.some(
          (c) =>
            c.args[0] === "network" &&
            c.args[1] === "rm" &&
            c.args.includes("new-network"),
        ),
      );
    }
    assert.ok(
      !calls.some(
        (c) =>
          c.args.includes("prune") ||
          (c.args[0] === "volume" && c.args[1] === "rm"),
      ),
    );
  });
test("lost secrets refuse startup; confirmed reset deletes only owned data", async (t) => {
  const f = await fixture(t);
  const project = checkoutIdentity(f.root);
  const fake = JSON.parse(await readFile(join(f.root, "fake.json"), "utf8"));
  await writeFile(
    join(f.root, "fake.json"),
    JSON.stringify({
      ...fake,
      volumes: [...dataVolumes(project), "unrelated"],
    }),
  );
  const refused = await f.run(["start"]);
  assert.notEqual(refused.code, 0);
  assert.match(refused.output, /configuration is missing/);
  const noConsent = await f.run(["reset"]);
  assert.notEqual(noConsent.code, 0);
  assert.match(noConsent.output, /confirmation/);
  const reset = await f.run(["reset", "--yes"]);
  assert.equal(reset.code, 0, reset.output);
  const deleted = (await f.calls())
    .filter((c) => c.args[0] === "volume" && c.args[1] === "rm")
    .flatMap((c) => c.args.slice(2));
  assert.deepEqual(deleted, dataVolumes(project));
  assert.equal((await f.run(["stop"])).code, 0);
  assert.equal((await f.run(["stop"])).code, 0);
});

test("stopped Docker fails before creating configuration or touching resources", async (t) => {
  const f = await fixture(t, { fail: "docker" });
  const result = await f.run(["start"]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Docker is not running/);
  assert.equal((await f.calls()).length, 1);
  await assert.rejects(f.state(), { code: "ENOENT" });
});

test("a reserved volume owned by another project is never attached or reset", async (t) => {
  const f = await fixture(t);
  const fake = JSON.parse(await readFile(join(f.root, "fake.json"), "utf8"));
  await writeFile(
    join(f.root, "fake.json"),
    JSON.stringify({
      ...fake,
      volumes: dataVolumes(checkoutIdentity(f.root)),
      ownedVolumes: [],
    }),
  );
  for (const args of [["start"], ["reset", "--yes"]]) {
    const result = await f.run(args);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /belongs to another project/);
  }
  assert.ok(
    !(await f.calls()).some(
      (c) => c.args.includes("build") || c.args.includes("rm"),
    ),
  );
});

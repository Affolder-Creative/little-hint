import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export function runtimeManifest(manifest) {
  const { devDependencies, ...runtime } = manifest;
  return runtime;
}

export function assertLockedPackages(source, runtime) {
  for (const [location, record] of Object.entries(runtime.packages)) {
    if (!location) continue;
    const original = source.packages[location];
    for (const key of ["version", "resolved", "integrity"]) {
      if (!original || original[key] !== record[key]) {
        throw new Error(`Runtime dependency changed: ${location} (${key})`);
      }
    }
  }
}

// npm's omit=dev retains development tools that also satisfy optional peers
// of runtime packages. Resolve from runtime roots alone, using the existing
// lock offline; reject any new package, version, URL, or integrity hash.
export function prepareRuntime(root = process.cwd()) {
  const output = path.join(root, ".local/runtime-dependencies");
  const scratch = mkdtempSync(path.join(tmpdir(), "little-hint-runtime-"));
  const read = (file) =>
    JSON.parse(readFileSync(path.join(root, file), "utf8"));
  const manifest = runtimeManifest(read("package.json"));
  const source = read("package-lock.json");
  const write = (directory, file, value) =>
    writeFileSync(
      path.join(directory, file),
      JSON.stringify(value, null, 2) + "\n",
    );
  try {
    write(scratch, "package.json", manifest);
    write(scratch, "package-lock.json", source);
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--offline",
        "--no-audit",
        "--no-fund",
      ],
      { cwd: scratch, stdio: "inherit" },
    );
    const runtime = JSON.parse(
      readFileSync(path.join(scratch, "package-lock.json"), "utf8"),
    );
    assertLockedPackages(source, runtime);
    mkdirSync(output, { recursive: true });
    write(output, "package.json", manifest);
    write(output, "package-lock.json", runtime);
    return output;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = prepareRuntime();
  if (process.argv[2] === "audit") {
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["audit", "--omit=dev", "--audit-level=high"],
      { cwd: output, stdio: "inherit" },
    );
  }
}

// Source coverage is independent of SPDX/license metadata. Never infer that a
// source URL or an SBOM alone fulfills a native binary's source obligations.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sourceRequirements(npm, apk) {
  const requirements = new Set();
  for (const pkg of npm) {
    if (/\b(?:A?GPL|LGPL|MPL)-/.test(pkg.license))
      requirements.add(`npm:${pkg.name}@${pkg.version}`);
    if (pkg.nativeLibraries) {
      // The combined native library includes statically linked dependencies.
      // Review the complete build inputs, not just libvips' top-level source.
      for (const [name, version] of Object.entries(pkg.nativeLibraries))
        requirements.add(`native:${name}@${version}`);
    }
  }
  for (const block of apk.trim().split(/\n\n+/)) {
    const fields = Object.fromEntries(
      block
        .split("\n")
        .filter((line) => /^[PVLoc]:/.test(line))
        .map((line) => [line[0], line.slice(2)]),
    );
    if (/GPL|MPL/.test(fields.L ?? ""))
      requirements.add(`apk:${fields.P}@${fields.V}#${fields.c}`);
  }
  return [...requirements].sort();
}
const safePath = (value) =>
  typeof value === "string" &&
  value.split("/").every((part) => /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(part));
export function validBundle(artifact) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar\.gz$/.test(artifact.file) ||
    !artifact.review?.trim() ||
    !Array.isArray(artifact.covers) ||
    !artifact.covers.length ||
    !Array.isArray(artifact.inputs) ||
    !artifact.inputs.length ||
    !Array.isArray(artifact.localFiles) ||
    !artifact.localFiles.length
  )
    return false;
  const files = [
    "MANIFEST.json",
    ...artifact.inputs.map((i) => i.file),
    ...artifact.localFiles.map((i) => i.file),
  ];
  return (
    new Set(files).size === files.length &&
    files.every(safePath) &&
    artifact.inputs.every(
      (i) =>
        /^https:\/\//.test(i.url) &&
        /^[a-f0-9]{64}$/.test(i.sha256) &&
        Number.isSafeInteger(i.size) &&
        i.size > 0 &&
        i.size < 512 * 1024 * 1024,
    ) &&
    artifact.localFiles.every(
      (i) =>
        safePath(i.path) &&
        /^(compliance\/sources\/|scripts\/vendor-source-crates\.py$)/.test(
          i.path,
        ),
    )
  );
}
export function missingSources(required, artifacts) {
  return required.filter(
    (id) =>
      !artifacts.some(
        (artifact) => validBundle(artifact) && artifact.covers.includes(id),
      ),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = process.argv[2];
  if (!directory)
    throw new Error("Supply an extracted image compliance directory.");
  const npm = JSON.parse(
    await readFile(path.join(directory, "npm-inventory.json")),
  );
  const apk = await readFile(path.join(directory, "apk-installed.txt"), "utf8");
  const required = sourceRequirements(npm, apk);
  if (!npm.length || !apk.includes("\nP:") || !required.length)
    throw new Error(
      "Refusing an empty or incomplete runtime source inventory.",
    );
  const { artifacts } = JSON.parse(
    await readFile("compliance/source-materials.json"),
  );
  if (new Set(artifacts.map((a) => a.file)).size !== artifacts.length)
    throw new Error(
      "Source archive filenames must be unique; one archive must not overwrite another.",
    );
  await writeFile(
    path.join(directory, "required-sources.json"),
    JSON.stringify(required, null, 2) + "\n",
  );
  const missing = missingSources(required, artifacts);
  if (missing.length)
    throw new Error(
      `Release blocked: corresponding-source coverage is unresolved. See docs/LICENSING.md.\n${missing.join("\n")}`,
    );
  await mkdir(path.join(directory, "sources"), { recursive: true });
  if (artifacts.some((a) => !validBundle(a)))
    throw new Error("Invalid source bundle manifest.");
  const selected = artifacts.filter((a) =>
    a.covers.some((id) => required.includes(id)),
  );
  const plan = path.join(directory, "source-plan.json");
  await writeFile(plan, JSON.stringify(selected, null, 2) + "\n");
  execFileSync(
    "python3",
    ["scripts/bundle-sources.py", plan, path.join(directory, "sources")],
    { stdio: "inherit" },
  );
  const built = JSON.parse(
    await readFile(path.join(directory, "sources/BUNDLES.json")),
  );
  const lockPath = "compliance/source-bundles.lock.json";
  if (process.argv.includes("--record-bundles")) {
    await writeFile(lockPath, JSON.stringify(built, null, 2) + "\n");
  } else {
    const reviewed = JSON.parse(await readFile(lockPath));
    for (const bundle of built) {
      const expected = reviewed.find((b) => b.file === bundle.file);
      if (
        !expected ||
        expected.sha256 !== bundle.sha256 ||
        expected.size !== bundle.size
      )
        throw new Error(
          `Source bundle differs from reviewed bytes: ${bundle.file}`,
        );
    }
  }
  console.log(
    `Corresponding-source coverage passed for ${required.length} exact component identifiers.`,
  );
}

// Source coverage is independent of SPDX/license metadata. Never infer that a
// source URL or an SBOM alone fulfills a native binary's source obligations.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
export function missingSources(required, artifacts) {
  return required.filter(
    (id) =>
      !artifacts.some(
        (artifact) =>
          artifact.covers?.includes(id) &&
          /^https:\/\//.test(artifact.url) &&
          /^[a-f0-9]{64}$/.test(artifact.sha256) &&
          artifact.review?.trim() &&
          /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar\.(?:gz|xz)$/.test(artifact.file),
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
  for (const artifact of artifacts.filter((a) =>
    a.covers.some((id) => required.includes(id)),
  )) {
    const response = await fetch(artifact.url, {
      signal: AbortSignal.timeout(300000),
    });
    if (!response.ok)
      throw new Error(
        `Source download failed: ${artifact.file}: ${response.status}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      throw new Error(`Source checksum mismatch: ${artifact.file}`);
    await writeFile(path.join(directory, "sources", artifact.file), bytes);
  }
}

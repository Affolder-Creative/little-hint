import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function matches(pattern, value) {
  return new RegExp(
    `^${pattern
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  ).test(value);
}
export function approved(name, version, license, policy) {
  return (
    policy.permissive.includes(license) ||
    Object.entries(policy.reviewed).some(
      ([pattern, expected]) =>
        matches(pattern, `${name}@${version}`) && license === expected,
    )
  );
}
export function inventory(root, policy, noticeRoot = root) {
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json")));
  const packages = [],
    notices = [],
    errors = [];
  for (const [location, record] of Object.entries(lock.packages).sort()) {
    if (!location) continue;
    const name = location.split("node_modules/").at(-1);
    if (!approved(name, record.version, record.license, policy))
      errors.push(
        `Unreviewed license: ${name}@${record.version}: ${record.license ?? "missing"}`,
      );
    const directory = path.join(root, location);
    if (!existsSync(path.join(directory, "package.json"))) continue;
    const pkg = JSON.parse(readFileSync(path.join(directory, "package.json")));
    if (
      pkg.version !== record.version ||
      pkg.name !== name ||
      pkg.license !== record.license
    ) {
      errors.push(`Installed package differs from lockfile: ${location}`);
      continue;
    }
    const files = readdirSync(directory).filter(
      (file) =>
        /^(licen[cs]e|copying|notice|copyright|ofl|third.party.*licen[cs]e)([._-]|$)/i.test(
          file,
        ) && statSync(path.join(directory, file)).isFile(),
    );
    let texts = files.map((file) =>
      readFileSync(path.join(directory, file), "utf8"),
    );
    if (!texts.length) {
      const readme = readdirSync(directory).find((file) =>
        /^readme\./i.test(file),
      );
      const content =
        readme && readFileSync(path.join(directory, readme), "utf8");
      const section = content?.match(
        /^#+\s+licen[cs]e\s*\r?\n([\s\S]*)/im,
      )?.[1];
      if (
        section &&
        /Permission is hereby granted/.test(section) &&
        /THE SOFTWARE IS PROVIDED/.test(section)
      )
        texts = [section.trim()];
    }
    if (!texts.length) {
      const fallback = Object.entries(policy.noticeFallbacks).find(
        ([pattern]) => matches(pattern, `${pkg.name}@${pkg.version}`),
      )?.[1];
      if (fallback)
        texts = fallback.map((file) =>
          readFileSync(
            path.join(
              file.startsWith("node_modules/") ? root : noticeRoot,
              file,
            ),
            "utf8",
          ),
        );
    }
    if (!texts.length)
      errors.push(`Missing license text: ${pkg.name}@${pkg.version}`);
    const bundledVersions = path.join(directory, "versions.json");
    packages.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      location,
      development: Boolean(record.dev),
      repository: pkg.repository ?? null,
      ...(pkg.name.startsWith("@img/sharp-libvips-") &&
      existsSync(bundledVersions)
        ? { nativeLibraries: JSON.parse(readFileSync(bundledVersions)) }
        : {}),
    });
    notices.push(
      `${pkg.name}@${pkg.version}\nLicense: ${pkg.license}\n${texts.join("\n\n")}`,
    );
  }
  return { packages, notices, errors };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const noticeRoot = process.cwd(),
    root = process.argv[3] || noticeRoot,
    output = process.argv[2] || ".local/compliance";
  const policy = JSON.parse(readFileSync("compliance/policy.json"));
  const result = inventory(root, policy, noticeRoot);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, "npm-inventory.json"),
    JSON.stringify(result.packages, null, 2) + "\n",
  );
  writeFileSync(
    path.join(output, "third-party-notices.txt"),
    "Little Hint third-party software notices\nThese components retain their own licenses.\n\n" +
      result.notices.join("\n\n" + "=".repeat(72) + "\n\n") +
      "\n",
  );
  console.log(
    `License policy passed; notices generated for ${result.packages.length} installed packages.`,
  );
}

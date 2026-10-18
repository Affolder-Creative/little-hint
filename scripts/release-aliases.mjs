import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
export function aliases(tags, version) {
  const parse = (value) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
      ? value.split(".").map(Number)
      : null;
  const current = parse(version);
  if (!current) throw new Error("Expected a stable semantic version.");
  const later = (candidate) => {
    for (let i = 0; i < 3; i++) {
      if (candidate[i] !== current[i]) return candidate[i] > current[i];
    }
    return false;
  };
  const versions = tags.map(parse).filter(Boolean);
  const result = [];
  if (
    !versions.some(
      (v) => v[0] === current[0] && v[1] === current[1] && later(v),
    )
  )
    result.push(`${current[0]}.${current[1]}`);
  if (!versions.some(later)) result.push("latest");
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const alias of aliases(
    JSON.parse(readFileSync(process.argv[2])),
    process.argv[3],
  ))
    console.log(alias);
}

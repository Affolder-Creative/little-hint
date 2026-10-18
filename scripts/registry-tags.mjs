import { spawnSync } from "node:child_process";
// The package is scoped to this repository's owner. A first publication has no
// package yet; GHCR often reports that as unauthorized instead of manifest-404.
const result = spawnSync(
  "gh",
  [
    "api",
    "--paginate",
    "users/kaffolder7/packages/container/little-hint/versions?per_page=100",
    "--jq",
    ".[].metadata.container.tags[]",
  ],
  { encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.status !== 0 && !result.stderr.includes("(HTTP 404)"))
  throw new Error(result.stderr);
console.log(
  JSON.stringify(
    result.status === 0 ? result.stdout.trim().split("\n").filter(Boolean) : [],
  ),
);

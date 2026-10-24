import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function browserImage(lock) {
  const version = lock.packages?.["node_modules/@playwright/test"]?.version;
  if (
    !/^\d+\.\d+\.\d+$/.test(version ?? "") ||
    ["playwright", "playwright-core"].some(
      (name) => lock.packages?.[`node_modules/${name}`]?.version !== version,
    )
  )
    throw new Error(
      "Playwright packages must share one locked stable version.",
    );
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const image = browserImage(lock);
  if (process.argv[2] === "verify") {
    if (process.env.PLAYWRIGHT_DOCKER_IMAGE !== image)
      throw new Error("Browser container does not match package-lock.json.");
    for (const name of ["@playwright/test", "playwright", "playwright-core"]) {
      const installed = JSON.parse(
        readFileSync(`node_modules/${name}/package.json`, "utf8"),
      );
      if (installed.version !== lock.packages[`node_modules/${name}`].version)
        throw new Error(`Installed ${name} does not match package-lock.json.`);
    }
  } else {
    console.log(`image=${image}`);
  }
}

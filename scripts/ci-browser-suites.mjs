import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Every spec has one logical owner. File groups keep database-backed tests
// sequential; only critique's request-local fixtures use test-level sharding.
export const suites = {
  e2e: {
    files: [
      "e2e",
      "reliability",
      "efficiency",
      "pagination",
      "buying-sort",
      "contribution-offers",
      "co-management",
    ],
  },
  "sign-in": { files: ["sign-in", "sms", "account-email"] },
  "list-features": {
    files: ["list-features"],
    scripts: [
      "tests/shopping-ui.browser.mjs",
      "tests/price-source.browser.mjs",
    ],
  },
  "group-events": {
    files: ["group-events", "repeat-event", "surprise-privacy"],
  },
  management: {
    files: ["management", "account-closure"],
    scripts: ["scripts/check-purchase-protection-ui.ts"],
  },
  polish: {
    groups: [
      ["ui-refinements", "admin-settings", "polish", "account-export"],
      [
        "settings-polish",
        "managed-profiles",
        "price-ranges",
        "price-range-display",
        "idea-audience",
      ],
    ],
  },
  pwa: {
    files: [
      "pwa",
      "update-notice",
      "update-lifecycle",
      "pwa-fallback",
      "capture",
      "item-drafts",
    ],
  },
  critique: { files: ["critique"], shards: 3 },
  notifications: {
    files: [
      "notifications",
      "channel-availability",
      "collaboration-refinements",
    ],
  },
  caching: { files: ["caching"] },
  "gift-discovery": {
    files: ["gift-discovery", "friends", "helpful-note", "product-sources"],
  },
};

export function suiteFiles(suite) {
  return (suite.files ?? suite.groups.flat()).map(
    (name) => `tests/${name}.spec.ts`,
  );
}

export function validateCoverage(
  files = readdirSync("tests")
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => `tests/${name}`),
  manifest = suites,
) {
  const assigned = Object.values(manifest).flatMap(suiteFiles);
  const errors = [
    ...files
      .filter((file) => !assigned.includes(file))
      .map((file) => `Unassigned browser spec: ${file}`),
    ...assigned
      .filter((file, index) => assigned.indexOf(file) !== index)
      .map((file) => `Duplicate browser spec: ${file}`),
    ...assigned
      .filter((file) => !files.includes(file))
      .map((file) => `Missing browser spec: ${file}`),
  ];
  if (errors.length) throw new Error(errors.join("\n"));
}

export function browserMatrix() {
  return {
    include: Object.entries(suites).flatMap(([suite, config]) => {
      const total = config.shards ?? config.groups?.length ?? 1;
      return Array.from({ length: total }, (_, i) => ({
        suite,
        shard: total === 1 ? "" : `${i + 1}/${total}`,
        id: total === 1 ? suite : `${suite}-${i + 1}-of-${total}`,
      }));
    }),
  };
}

export function browserCommand(suite, shard = "") {
  const config = suites[suite];
  if (!Object.hasOwn(suites, suite))
    throw new Error("Supply one known browser suite.");
  let files = suiteFiles(config);
  const args = [];
  if (shard) {
    const total = config.shards ?? config.groups?.length ?? 1;
    const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
    if (
      !match ||
      Number(match[2]) !== total ||
      Number(match[1]) > total ||
      total === 1
    )
      throw new Error(`Invalid shard for ${suite}: ${shard}`);
    if (config.groups)
      files = config.groups[Number(match[1]) - 1].map(
        (name) => `tests/${name}.spec.ts`,
      );
    else args.push("--fully-parallel", `--shard=${shard}`);
  }
  return {
    args: [
      "--no-install",
      "playwright",
      "test",
      ...files,
      ...args,
      "--workers=1",
      "--max-failures=1",
      "--retries=0",
    ],
    scripts: config.scripts ?? [],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validateCoverage();
  if (process.argv[2] === "matrix")
    console.log(`matrix=${JSON.stringify(browserMatrix())}`);
}

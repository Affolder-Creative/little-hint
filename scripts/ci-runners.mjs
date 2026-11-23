import { pathToFileURL } from "node:url";

export function runners(provider = "github") {
  if (!["github", "blacksmith"].includes(provider))
    throw new Error("Runner provider must be github or blacksmith.");
  const browser =
    provider === "blacksmith" ? "blacksmith-4vcpu-ubuntu-2404" : "ubuntu-24.04";
  return {
    browser,
    containers: {
      include: [
        { arch: "amd64", runner: browser },
        {
          arch: "arm64",
          runner:
            provider === "blacksmith"
              ? "blacksmith-4vcpu-ubuntu-2404-arm"
              : "ubuntu-24.04-arm",
        },
      ],
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const selected = runners(process.env.RUNNER_PROVIDER);
  console.log(
    `browser=${selected.browser}\ncontainers=${JSON.stringify(selected.containers)}`,
  );
}

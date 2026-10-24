import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const output = (key, value) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
export function validateTag(tag) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag))
    throw new Error(
      "Only stable vMAJOR.MINOR.PATCH release tags are supported.",
    );
}
export function validateIdentity(ref, tag, version, sha) {
  validateTag(tag);
  if (ref.type !== "commit" || !/^[a-f0-9]{40}$/.test(sha) || ref.sha !== sha)
    throw new Error(
      "Release tag is not the exact commit that passed CI. Retry that draft explicitly.",
    );
  if (tag !== `v${version}`)
    throw new Error("Package and release versions disagree.");
}
function release(tag) {
  validateTag(tag);
  const data = JSON.parse(
    gh(["release", "view", tag, "--json", "isDraft,tagName,targetCommitish"]),
  );
  if (!data.isDraft)
    throw new Error("Only an unpublished draft can be retried.");
  return data;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "select") {
    if (process.env.GITHUB_REF !== "refs/heads/main")
      throw new Error("Run release workflows from main.");
    let sha = process.env.GITHUB_SHA;
    if (process.env.RETRY_TAG) {
      release(process.env.RETRY_TAG);
      sha = git(["rev-parse", `${process.env.RETRY_TAG}^{commit}`]);
      git(["merge-base", "--is-ancestor", sha, "origin/main"]);
    }
    output("sha", sha);
  } else if (process.argv[2] === "check-main") {
    const checked = process.env.CHECKED_SHA;
    const ref = JSON.parse(
      gh(["api", `repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/main`]),
    ).object;
    if (
      ref?.type !== "commit" ||
      ![checked, ref.sha].every(
        (sha) => typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha),
      )
    )
      throw new Error("Cannot verify the checked commit against main.");
    const current = checked === ref.sha;
    if (!current) {
      const message = `Release generation skipped: checked commit ${checked} was superseded by main at ${ref.sha}. The latest main run will collect the merged changes.`;
      console.log(`::notice::${message}`);
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    }
    output("current", current);
  } else if (process.argv[2] === "resolve") {
    const tag = process.env.RETRY_TAG || process.env.CREATED_TAG;
    if (tag) {
      release(tag);
      // Release Please can create a tag after checkout, so resolve through the API.
      let ref = JSON.parse(
        gh([
          "api",
          `repos/${process.env.GITHUB_REPOSITORY}/git/ref/tags/${tag}`,
        ]),
      ).object;
      if (ref.type === "tag")
        ref = JSON.parse(
          gh([
            "api",
            `repos/${process.env.GITHUB_REPOSITORY}/git/tags/${ref.sha}`,
          ]),
        ).object;
      const version = JSON.parse(readFileSync("package.json")).version;
      validateIdentity(ref, tag, version, process.env.CHECKED_SHA);
      output("tag", tag);
      output("version", version);
    }
  } else throw new Error("Expected select, check-main, or resolve.");
}

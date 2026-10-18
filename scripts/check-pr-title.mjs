const title = process.env.PR_TITLE ?? "";
if (
  !/^(feat|fix|perf|deps|build|ci|docs|test|refactor|style|chore|revert)(\([a-zA-Z0-9._/-]+\))?!?: .+/.test(
    title,
  )
) {
  throw new Error(
    "Use a Conventional Commit PR title, for example: feat: add gift reminders",
  );
}

export function acceptancePassed(exitCode, stats) {
  return (
    exitCode === 0 &&
    stats?.expected > 0 &&
    stats.unexpected === 0 &&
    stats.flaky === 0 &&
    stats.skipped === 0
  );
}

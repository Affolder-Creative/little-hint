# Runner decision: keep GitHub-hosted runners

On October 24, 2026, we compared GitHub and Blacksmith using the same commit,
`dad78eb7c311199fb2c70d9be44ab7a6e30730dc`. Each provider ran eight browser suites
and native AMD64/ARM64 Docker checks. All 80 workload jobs passed across four
comparisons. Paid Docker build-layer caching was disabled.

| Sample                                                                                   | GitHub | Blacksmith |
| ---------------------------------------------------------------------------------------- | ------ | ---------- |
| [Initial run](https://github.com/Affolder-Creative/little-hint/actions/runs/40148557552) | 3m34s  | 3m35s      |
| [Warm run 1](https://github.com/Affolder-Creative/little-hint/actions/runs/40148834747)  | 2m50s  | 2m08s      |
| [Warm run 2](https://github.com/Affolder-Creative/little-hint/actions/runs/40149081126)  | 2m37s  | 2m02s      |
| [Warm run 3](https://github.com/Affolder-Creative/little-hint/actions/runs/40149296260)  | 2m43s  | 2m09s      |
| Warm median                                                                              | 2m43s  | 2m08s      |

Times measure workload completion after the common preparation job, including
scheduling, setup, tests, and cleanup. They exclude preparation/reporting and do
not measure a migration of the entire PR workflow. The initial run populated the
experiment's Docker build caches; other shared caches could already be warm.

Blacksmith saved 35 seconds, about 21%, in the warm medians. Faster browser
container startup accounted for much of the improvement. This fell below our
roughly one-minute adoption target, so we retained the existing GitHub-hosted
runners and removed the temporary benchmark workflow, helper, and tests. The CI
performance improvements from PR #44 remain in place.

Reconsider if representative PR durations or build workloads grow substantially.
The benchmark implementation is recoverable from
[PR #50](https://github.com/Affolder-Creative/little-hint/pull/50) and Git history;
there is no need to maintain an executable benchmark in the active workflow set.

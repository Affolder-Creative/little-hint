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

## November 23 CI improvements

The first full PR run of `69595f551a79379bbd8843d2dc43afcf85274458`
passed on GitHub runners in **4m39s**. The preceding application PR sample
completed in **6m47s**. These are individual, unpaired samples with existing
shared caches, not percentile estimates or a provider comparison.

| Workload             | Earlier PR | Improved PR |
| -------------------- | ---------: | ----------: |
| Full CI              |      6m47s |       4m39s |
| AMD64 container job  |      6m06s |       3m17s |
| Longest critique job |      5m32s |       2m51s |
| Longest polish job   |      4m48s |       2m57s |
| E2E job              |      4m18s |       4m14s |

- [Earlier full PR run](https://github.com/Affolder-Creative/little-hint/actions/runs/45211580323).
- [Improved full PR run](https://github.com/Affolder-Creative/little-hint/actions/runs/45235481245).

The improved AMD64 container checks themselves took about 119 seconds across
two lanes. Their individual durations were 35.4 seconds for image smoke,
83.4 seconds for upgrade/recovery, 37.9 seconds for staging, and 76.6 seconds
for preview. All checks passed. E2E is now the longest job.

Controlled missing-control checks failed at about 30.7 seconds in both the
Playwright page fixture and a manually created context. Each retained a trace
and did not run the next test. A real Docker cancellation check verified that
child processes stopped and the registered disposable container, volume, and
network were removed. Local native image smoke and baseline upgrade/recovery
also passed.

### Blacksmith comparison results

Repository access was restored and the comparison completed on November 23.
All eight full-validation runs used the same tested and workflow commit,
`2c62536809687975e82dc353fd303bf777389c62`. Each provider ran one initial sample followed by
three warm samples, alternating providers and waiting for completion between
runs. All 160 workflow jobs passed, without automatic test retries.

| Sample      |                                                                             GitHub |                                                                         Blacksmith |
| ----------- | ---------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------: |
| Initial     | [4m42s](https://github.com/Affolder-Creative/little-hint/actions/runs/45254036563) | [4m29s](https://github.com/Affolder-Creative/little-hint/actions/runs/45253176030) |
| Warm 1      | [4m54s](https://github.com/Affolder-Creative/little-hint/actions/runs/45255781986) | [4m32s](https://github.com/Affolder-Creative/little-hint/actions/runs/45254950958) |
| Warm 2      | [4m49s](https://github.com/Affolder-Creative/little-hint/actions/runs/45257526490) | [3m55s](https://github.com/Affolder-Creative/little-hint/actions/runs/45256720052) |
| Warm 3      | [4m55s](https://github.com/Affolder-Creative/little-hint/actions/runs/45259192033) | [4m10s](https://github.com/Affolder-Creative/little-hint/actions/runs/45258448733) |
| Warm median |                                                                          **4m54s** |                                                                          **4m10s** |

Blacksmith improved the warm median by **44 seconds**, about
15.0%. This did not reach the agreed one-minute
adoption threshold, so CI, release images, and staging builds retain standard
GitHub runners. Native AMD64 and ARM64 checks remain required. The temporary
provider input and runner-selection helper were removed; no recurring benchmark
or monitoring workflow was added.

| Warm median metric             |               GitHub |           Blacksmith |
| ------------------------------ | -------------------: | -------------------: |
| Sum of all job runtimes        | 42.45 runner-minutes | 34.00 runner-minutes |
| E2E setup before test launcher |                  61s |                  16s |
| E2E test launcher              |                 191s |                 182s |

Times measure from workflow attempt start to the final job's completion,
including scheduling, setup, tests, and cleanup. Lightweight jobs remained on
GitHub for both providers. Blacksmith browser/container jobs requested native
4-vCPU Ubuntu 24.04 runners. Both providers retained the same GitHub Actions
Docker build-layer cache; paid layer caching and larger-runner experiments were
not enabled. The initial samples are excluded from the medians, and existing
shared caches mean they are not verified cold-cache measurements. Three warm
samples per provider are not percentile estimates.

Runner-minutes sum job durations before billing rounding. Actual Blacksmith
account billing was unavailable, so these totals are not an invoice or a price
estimate. Standard GitHub-hosted compute is free for this public repository.
See [GitHub's billing documentation](https://docs.github.com/en/actions/concepts/billing-and-usage).

The [earlier exploratory Blacksmith run](https://github.com/Affolder-Creative/little-hint/actions/runs/45251302558)
failed an existing passkey keyboard-focus assertion. That run is excluded.
Delaying queued UI updates reproduced the failure locally. Focus restoration
now runs after React commits the updated list, and the existing regression
passed ten repetitions with the delayed-update case. The subsequent provider
comparison used that corrected commit on both providers.

The original [unassigned trial](https://github.com/Affolder-Creative/little-hint/actions/runs/45235532742)
was cancelled and supplies no execution-time evidence. Future comparisons can
recover the temporary provider-selection workflow from the tested commit above;
the active workflow set does not retain that experiment.

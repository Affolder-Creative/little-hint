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

### Blacksmith comparison status

The [Blacksmith trial](https://github.com/Affolder-Creative/little-hint/actions/runs/45235532742)
used the same commit. Its sixteen Blacksmith browser/container jobs stayed
queued without an assigned runner. The available dashboard session required
sign-in, so repository enablement could not be verified. This is not an
execution-time result. GitHub remains the default; no paid layer caching or
larger runners were enabled.

Once repository access is restored, use the CI workflow's manual inputs on this
branch or on main after merge. Set `ref` to the same full improved commit SHA
for both providers and alternate `runner-provider=github` and
`runner-provider=blacksmith`. Both the workflow ref and tested commit must
include the new runner-selection scripts. Lightweight jobs stay on GitHub.

Run one initial sample and three warm samples per provider, waiting for each
run to finish before starting the next. Record individual attempts, including
queue delay, setup, tests, cleanup, total runner minutes, and actual Blacksmith
spend when available. Existing caches may already be warm, including the
provider's transparent image cache, so do not claim a cold result without
verified cold caches. Separate the initial sample from the warm median.

Adopt Blacksmith for browser and container jobs only if the warm full-CI median
is at least one minute lower, with all checks passing and no reliability
regression. If adopted, use native 4-vCPU runners for release images and staging
builds too. Otherwise keep GitHub. Remove the temporary provider-comparison
inputs and selection helper after recording the decision; there is no recurring
benchmark workflow. Paid layer caching and 8-vCPU trials require separate
build-time evidence.

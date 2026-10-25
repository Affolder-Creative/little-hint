# Blacksmith runner benchmark

Normal PR checks, Release Please, and release publishing continue to use
GitHub-hosted runners. `Runner benchmark` is a separate, manually triggered
GitHub Actions workflow. It runs the eight browser suites and both native Docker
architectures from CI, including smoke tests, vulnerability scanning, and source
bundle verification. It does not push images or publish releases.

## Organization setup

1. Sign in at <https://app.blacksmith.sh> using a GitHub organization owner account.
2. Install the Blacksmith GitHub App on **Affolder-Creative**, selecting only
   **little-hint** for repository access. Finish onboarding so the repository can
   receive runners. Skip the bulk workflow migration wizard.
3. If the organization restricts runner groups or third-party Actions, allow this
   repository to use the Blacksmith runner group and the pinned `useblacksmith/*`
   actions in this workflow. Do not broaden access to unrelated repositories.
4. After installation, set the repository Actions **variable**, not a secret,
   `BLACKSMITH_ENABLED` to `true`. This is an acknowledgement gate, not an API
   connectivity check. The benchmark fails before scheduling Blacksmith jobs when
   the variable is absent.

   ```sh
   gh variable set BLACKSMITH_ENABLED --body true --repo Affolder-Creative/little-hint
   ```

No PAT, Blacksmith API key, production database, or deployment credentials are
needed. The GitHub App registers runners. The workflow token has `contents: read`;
only the reporting job also receives `actions: read`.

Blacksmith includes 3,000 equivalent 2-vCPU x64 minutes per organization per month.
The benchmark uses 4-vCPU runners, so one x64 runtime minute consumes two included
minutes. Both providers run ten jobs per comparison; assess **summed job time**
when estimating usage. Runner compute beyond the allowance is chargeable.
Set a spending alert in Blacksmith Settings if desired; it is an email alert,
not a spending cap.

Automatic Docker **container-image caching** is included. The separate Docker
**build-layer cache** costs $0.50/GB/month and is disabled by default here. Select
`docker_layer_cache=true` only when deliberately testing that paid feature. Its
storage can remain allocated after the job; review/remove benchmark caches in
Blacksmith when the experiment is over. Do not assume public repository status
qualifies this project for Blacksmith's OSS program.

Sources checked October 24, 2026:
[setup](https://docs.blacksmith.sh/introduction/quickstart),
[GitHub App](https://docs.blacksmith.sh/blacksmith-administration/github-app),
[runner allowance](https://docs.blacksmith.sh/blacksmith-runners/overview#faq),
[container-image cache](https://docs.blacksmith.sh/blacksmith-caching/docker-container-caching),
[Docker build cache](https://docs.blacksmith.sh/blacksmith-caching/docker-builds),
[spending alerts](https://docs.blacksmith.sh/introduction/settings).

## Run a comparison

Merge the benchmark workflow first so GitHub exposes its manual dispatch trigger.
In **Actions → Runner benchmark → Run workflow**, use the same workflow revision
and full application commit SHA for all samples. A blank commit uses the selected
workflow revision's SHA. The tested commit must include the current browser CI
scripts and suites.

Inputs:

| Input                | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `commit`             | Full immutable application commit SHA; blank uses the workflow SHA |
| `providers`          | `github` for a baseline, `both` for comparison, or `blacksmith`    |
| `cache_key`          | Experiment ID, 1–32 lowercase letters/digits/hyphens               |
| `docker_layer_cache` | Paid Blacksmith persistent Docker build cache, default `false`     |

Start with `providers=both` and `docker_layer_cache=false`. Example after merging:

```sh
benchmark_sha=$(gh api repos/Affolder-Creative/little-hint/commits/main --jq .sha)
gh workflow run runner-benchmark.yml --repo Affolder-Creative/little-hint \
  --ref main -f commit="$benchmark_sha" -f providers=both \
  -f cache_key=pilot-1 -F docker_layer_cache=false
```

Run once to populate the benchmark Docker build caches, then repeat at least three
times with the **same commit, workflow revision, cache key, and cache mode**. Wait
for each run to complete before dispatching the next. The concurrency group prevents
overlapping runs with the same experiment ID but does not maintain a queue of every
pending request.

For the paid layer-cache experiment, use a different cache key and enable
`docker_layer_cache`. GitHub continues using its existing exported BuildKit cache;
Blacksmith uses its persistent builder and build action. This measures the combined
runner/cache configuration, not an isolated CPU comparison. Builder fallback is
disabled so a failed persistent-cache setup cannot masquerade as a valid sample.

A new cache key creates a fresh benchmark **Docker build cache** on each provider.
It does not clear npm caches, corresponding-source downloads, registry caches, or
Blacksmith's shared container-image cache. Call the first sample a build-cache
first run, not a fully cold machine. Keep benchmark build-cache scopes separate
from normal CI and release caches.

## Read the results

The run summary and `runner-benchmark-*` artifact contain:

- Per-provider completion time measured from the shared preparation job finishing.
- Summed job seconds, useful for estimating compute usage.
- Each job's start delay, elapsed time, and conclusion.
- All executed step timings, including container initialization, npm install,
  Docker build, browser tests, smoke tests, scans, and cleanup.
- Raw GitHub job data for independent analysis.

Start delay includes runner scheduling/provisioning and is not a pure queue-time
measurement. Provider completion covers the benchmark workloads, not the full PR
workflow. The report fails if either workload matrix fails. Do not treat failed,
cancelled, or incomplete samples as faster successful runs.

Compare medians and the slowest samples across passing runs, and check observed
Blacksmith usage before expanding the pilot. A practical adoption target is at
least a minute saved on the full PR path at an acceptable monthly cost. Shorter
individual jobs only help merge latency if they shorten the longest dependency
path. Authentication cooldowns remain real waits on either provider.

The workload steps are intentionally copied from `ci.yml` to keep this experiment
separate from required checks. Update both workflows when changing browser suites
or Docker validation. `npm run test:tooling` checks suite and verification-command
alignment. Keep these benchmark checks out of branch protection; switching normal
CI runners is a separate decision after measurement.

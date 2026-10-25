# CI and releases

Every change goes through a PR into `main`. PR CI always runs the quality job:
types, unit and tooling tests, builds, dependency audits, license notices, Compose
validation, and workflow syntax. It selects the expensive checks from the complete
PR diff, including deleted files and both paths of a rename:

| Check                      | PR changes that select it                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 18 integration  | Backend/shared code or the integration test                                                                                        |
| All seven browser suites   | App source, public assets, HTML entrypoint, browser tests/helpers, or Playwright configuration                                     |
| AMD64 and ARM64 containers | Docker/Compose/environment examples, dependencies, build/compliance/release tooling, LICENSE, or server app/worker/CLI entrypoints |
| Brand tooling audit        | Brand sources, audit tooling, compliance policy, or notice tooling                                                                 |
| All checks                 | Dependencies, TypeScript/Vite/build configuration, CI tooling/the CI workflow, or an unrecognized path                             |

Docs, marketing, and design changes do not select unrelated expensive checks.
Unit-test-only changes use the quality job. Mixed changes select the union of
their checks. An unavailable diff runs everything. Manual and reusable CI runs,
including release candidates and release retries, always run the full suite.
Ordinary main merges only maintain the release PR unless they create a release candidate.
Pages, PR-title, Dependabot, and branch-ruleset changes do not select application
checks. Release, staging, security, and image-migration workflow changes select
container checks. Unknown GitHub configuration still selects everything.
The selection is recorded in the run summary; `scripts/ci-policy.mjs` contains
the exact path rules, with coverage in `npm run test:tooling`.

Each browser suite gets a fresh database and real local email-code authentication.
External service credentials are unnecessary. Browser jobs use the official
Playwright Noble image selected from the exact package-lock version, with Node 24
and Postgres reached through its service hostname. An incompatible installed
Playwright version fails before testing; there is no per-job apt or browser install.

The browser launcher builds a separate test server into `.local/browser-server`.
It serves the production frontend with the same server application and a general
budget of 10,000 requests/minute, removing the old 600 ms delay per request.
The override requires `NODE_ENV=test`, a test deployment environment, and the
`little_hint_e2e` database. Production entrypoints never enable it. Authentication
and endpoint-specific limits remain enabled; dedicated server tests verify the
default 150-request budget, per-IP isolation, and stricter endpoint limits.
`E2E_BROWSER_TEST_SERVER=1` only tells browser fixtures to skip the general-limit
cooldown. Local tests against the normal server retain the cooldown. The launcher
selects an unused port so a development app cannot satisfy its readiness check.
Both CI and release container jobs use native runners:
`ubuntu-24.04` for AMD64 and `ubuntu-24.04-arm` for ARM64, without QEMU.

`CI gate` requires successful selection and quality checks, validates every
selection output, and rejects failed, cancelled, missing, or unexpectedly skipped
jobs. The brand audit's actual step outcome is checked too. Only explicitly
unselected checks may be skipped. Keep the CI workflow itself unfiltered so its
gate always reports a result.

The separate `PR title` check runs on PR creation, new commits, reopening, and
metadata edits. Editing the title or description does not rerun or cancel code CI.
Code CI runs on opening, new commits, and reopening, including draft PRs; marking
a draft ready does not repeat checks already run for that commit. Require both
`CI gate` and `PR title` when branch rules are available.

Use Conventional Commit PR titles and squash merges. `feat:` changes the minor
version and `fix:` changes the patch version. Before 1.0, breaking changes change
the minor version. Use `!` or a `BREAKING CHANGE:` footer for a breaking change.
Dependency updates use `deps:`; release PRs use Release Please's generated title.
The initial release is `v0.1.0`. npm publishing is disabled by `private: true`.

## Release sequence

1. A merge to main selects the commit and checks that it is still current.
2. Release Please creates or updates the version/changelog PR. Review and merge
   it only when the version is ready. GitHub's built-in token avoids another
   credential, but bot-created PR workflows need a maintainer to click
   **Approve workflows to run**. Approve again after bot updates if GitHub asks.
3. A merged release PR produces a tagged draft release. Verify that its commit
   matches the selected commit and its version matches package.json, then run
   full reusable CI against that exact commit. No tag means no full CI or image
   build. Image jobs depend on successful CI; failed candidates remain drafts.
4. Each platform gets an OCI build with BuildKit provenance and SBOM attestations,
   an app/worker smoke test, a vulnerability scan, an SPDX image SBOM, and a
   corresponding-source coverage check. The reviewed source bundles are checked
   against each actual image and their recorded archive hashes; see [licensing](LICENSING.md).
5. Once both platforms pass, publish the versioned multi-platform GHCR image and
   upload Docker-loadable archives, deployment files, notices, the three shared
   corresponding-source bundles, SBOMs, image digests and `SHA256SUMS`. Publish the GitHub Release last.

Registry location: `ghcr.io/affolder-creative/little-hint`. Tags are `0.1.0`-style full
versions, `0.1`-style minor aliases, `latest`, and internal
`sha-<full-commit>-<architecture>` staging tags. Full versions and staging tags
are reused rather than overwritten. Older-version retries do not move aliases
backward. Stable `vMAJOR.MINOR.PATCH` releases are supported; prerelease channels
are outside this initial implementation.

Release jobs use write permissions only where necessary. PR CI cannot publish
images, create releases, or access deployment secrets. Publication runs only
from the canonical repository's main branch. It does not deploy to Coolify or
restart any existing installation. The local-build Compose workflow remains
available.

### Reviewing the version before merging

Review the version for the changes being shipped. For v0.3.0, the move to the
organization repository and image namespace was treated as a minor pre-1.0
release. The number of merged PRs alone does not determine the version.

If correcting an existing release PR as in that release, update all of these
together on its branch before merging:

- `.release-please-manifest.json` and `package.json`.
- The root and `packages[""]` versions in `package-lock.json`.
- The `CHANGELOG.md` heading and comparison URL.
- The release PR's generated title and version references in its description.

Changing only the PR title does not change the published version. Release Please
can regenerate the PR after another main merge, so recheck the metadata and
successful checks on its exact final head before squash-merging. Then wait for
the merged commit's full release workflow and completed publication before
starting deployment.

## Measuring CI performance

Keep standard GitHub runners while measuring the workflow changes. Compare ten
representative completed runs by change category, recording queue delay, browser
setup, test duration, and total runner minutes separately. Do not compare a
docs-only run with a full application run. The target is routine application PRs
under three minutes with all suites retained; container-changing PRs can take
longer. The October 24 baseline was 47 seconds for docs, 5m 6s for a full run,
and 11m 35s when Ubuntu dependency downloads stalled. A normal browser e2e step
took about 224 seconds with pacing. These are samples, not percentile estimates.

The October 24 [runner benchmark](RUNNER_BENCHMARK.md) measured a 35-second
improvement in warm median completion on Blacksmith. We retained GitHub-hosted
runners and removed the temporary benchmark. No recurring monitoring is configured.

## Recovery

Failures leave the release in draft. Open **Actions → Release → Run workflow**,
select `main`, and enter the existing draft tag. The workflow validates the tag
is on main's history, reruns CI for that exact commit, and reuses existing image
bytes. It checks source/version/architecture labels and republishes missing
assets without moving the source tag. The OCI archive preserves build
attestations when it is copied to GHCR. Checksum verification and `docker load`
are exercised before image archives are uploaded.

A retry uses scripts and compliance policy from the tagged commit. If code or
compliance evidence needs changing, use a new version rather than mutating the
old tag. The first implementation only supports retrying drafts; it deliberately
refuses to rewrite an already published release. Uploads across GHCR and GitHub
are not one atomic transaction: a failure can leave staged images or partially
uploaded draft assets. Review the failed job before retrying.

Merges are serialized for release processing. If main advances while an older
push run is waiting to prepare a release, the stale run skips release generation and
finishes successfully, with a notice and summary naming both commits. Release
resolution, image builds, and publication are skipped too; the latest main run
will collect the merged changes. API failures or invalid commit metadata still
fail the run. Manual draft retries remain eligible for older commits on main's
history and keep all tag, version, and checked-commit validation. No tag is
accepted merely because its name looks like a release version.

## Deploying a release

For existing Coolify resources, follow [Coolify release upgrades](COOLIFY_UPGRADES.md)
for artifact verification, backups, staging acceptance and production promotion.
Use the same public `ghcr.io/affolder-creative/little-hint` digest in both
environments. The private `little-hint-staging` package is for feature builds.

Download the deployment bundle from a completed release. Its example environment
contains a digest-pinned `LITTLE_HINT_IMAGE` and no deployment secrets. Fill in
all required runtime settings, including SMTP and your exact HTTPS `APP_URL`.
Leave `COMPOSE_PROFILES` empty until the optional backup sidecar's credentials
and image access are configured. See the [first-install checklist](DEPLOYMENT.md#first-installation)
for secret generation, proxy routing, and acceptance checks. Then run:

```sh
docker compose --env-file .env.production -f compose.yaml -f compose.ghcr.yaml up -d
docker compose --env-file .env.production -f compose.yaml -f compose.ghcr.yaml exec app \
  node dist/server/cli.js bootstrap you@example.com
```

Configure your HTTPS reverse proxy for app port 3000. For a local loopback port,
add `-f compose.local.yaml`. Both services use the same image. Back up the database
and uploads before upgrades. Migrations run before app startup. A container-only
rollback does not undo database migrations; restore a compatible backup when
necessary.

For archive installation, download the matching architecture, verify its entry
in `SHA256SUMS`, and run `gzip -dc IMAGE.tar.gz | docker load`. Set
`LITTLE_HINT_IMAGE` to the full-version tag stored in the archive instead of its
registry digest. PostgreSQL and the optional backup sidecar are separate images;
these downloads are not a complete air-gapped installation kit.

## Repository settings and public launch

Keep default workflow permissions read-only, while allowing Actions to create
PRs. Workflow jobs explicitly request their required permissions. Enable
Dependabot alerts and security updates. Do not enable Dependabot auto-merge.
Weekly version-update PRs cover npm, brand Python/npm tools, Actions and Docker.
Node/PostgreSQL major upgrades and the backup sidecar's PostgreSQL variant need
manual coordination. The weekly security workflow checks npm and, once available,
the published `latest` image. Production npm vulnerabilities at high/critical
severity fail CI; container scanning fails on fixable high/critical findings.
No vulnerability exceptions are preconfigured. Any future exception needs a
specific reason, scope, owner and expiry in a reviewed PR.

The public organization repository supports the prepared branch ruleset.
To restore it when missing:

```sh
gh api --method POST repos/Affolder-Creative/little-hint/rulesets \
  --input .github/rulesets/main.json
```

The rules require PRs, the GitHub Actions `CI gate` and `PR title` checks, an up-to-date branch,
resolved review threads and linear history; block force pushes/deletion; and
require zero external approvals for the solo maintainer. No bypass actor is
configured. Confirm the check name in a real PR before applying. If the ruleset
already exists, update its ID instead of creating duplicates.

Making the repository public is a separate decision. GHCR packages initially
remain private and must also be made public explicitly for anonymous pulls.
Before launch, license the separately maintained
backup sidecar, enable private vulnerability reporting, and complete the manual
production checks in [VALIDATION.md](VALIDATION.md). Do not label this project as
OSI open source under PolyForm Perimeter.

For the move from the personal account to Affolder Creative, follow the
[organization transfer checklist](ORGANIZATION_TRANSFER.md) before publishing
the first organization-owned image.

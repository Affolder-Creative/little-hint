# 1.0.0 candidate sign-off

On November 6, 2026, the maintainer accepted the shorter staging observation and
the testing limitations below, and authorized preparing a PR requesting
`Release-As: 1.0.0`. This records candidate acceptance with exceptions. It does
not authorize merging this PR, merging the generated version PR, publication,
or production deployment.

## Candidate and evidence

The accepted main revision is `906f9106729eb1ed594e355a2d703dfbe1679011`.
Its [full CI run](https://github.com/Affolder-Creative/little-hint/actions/runs/42250751328)
passed quality checks, database integration, all eleven browser suites, both
container architectures and their upgrade checks, and the CI gate.

The deployed staging app and worker were built from
`76e2e89e9c4662f6aa8e5df3fa960514a1bdea3f`, with image digest
`sha256:68a22f51b31d838e13e63c611b6a34a95bdab7b1e790d29034543c1428571711`
on linux/amd64. The later staging configuration at
`dde760c6cf0b2263b63f26c063bfb8a7cd9e0710` added the backup sidecar.
There are no changes to `src/`, `public/`, or `package-lock.json` between the
deployed app revision and accepted main. The `package.json` changes add
acceptance tooling commands. The staged image is not a build of accepted main
or the final public 1.0.0 image.

Evidence was collected by Codex and the maintainer on November 6. Operational
logs, restore records, screenshots, and the completed operator worksheet remain
private in `.local/deployment/v1-acceptance.md` and its referenced artifacts.

| Check                         | Result and scope                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full candidate CI and upgrade | Passed on accepted main in the run linked above, including the automated 0.19.4 upgrade/recovery checks on both architectures.                                                                                                                                                                                                                                                                          |
| Three-engine acceptance       | 102 passed, zero skipped, flaky, or failed, on clean PR #183 head `f3a01f6a4a3e00209c1e056494ed671b50325137`. Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2. Synthetic API fixtures exercise the production frontend; they do not certify deployed providers or physical devices. [Full PR CI](https://github.com/Affolder-Creative/little-hint/actions/runs/42247438710) also passed before merge. |
| Deployed staging smoke        | Passed public health, synthetic email-code sign-in, authenticated data and administration status, session management, and sign-out after the backup rollout.                                                                                                                                                                                                                                            |
| Isolated staging recovery     | Passed restoration of 22 application record kinds and 26 uploaded files into separate temporary storage, with matching records and file hashes. This was an on-host synthetic restore.                                                                                                                                                                                                                  |
| Off-host backup and restore   | Passed by maintainer report. Recovery password, settings encryption key, and storage access are confirmed stored securely outside the hosting server.                                                                                                                                                                                                                                                   |
| Backup notification delivery  | Passed a controlled stale-backup health failure through Coolify's scheduled-task failure path, with the resulting email observed in the maintainer's inbox. The temporary threshold applied only to that test process; the test task is disabled.                                                                                                                                                       |
| Recurring freshness checks    | Enabled hourly in staging and production, using `backup-sidecar health` and the existing 26-hour limit. Both initial manual executions passed.                                                                                                                                                                                                                                                          |
| Phone and installed-app use   | Passed by maintainer report for normal use on the maintainer's phone.                                                                                                                                                                                                                                                                                                                                   |
| Real email delivery           | Passed by maintainer report for normal email use.                                                                                                                                                                                                                                                                                                                                                       |
| VoiceOver                     | Passed by maintainer report for the guided Mac/Chrome staging check: Settings navigation, dialog and field labels, invalid-email validation, Escape/Cancel, and return of focus to the opener.                                                                                                                                                                                                          |
| Final interface coverage      | The combined account controls and critical flows received the [Impeccable polish pass](V1_READINESS.md#interface-and-accessibility-polish-evidence). Candidate acceptance fixtures passed across three engines; device and screen-reader scope is limited as stated here.                                                                                                                               |

## Accepted exceptions and remaining validation limits

The maintainer explicitly accepted these limitations for preparing 1.0.0. They
remain limitations, not additional passing test results. The general acceptance
worksheet and support policy still apply to future releases and installations.

- **Observation duration.** The original monitor recorded 121 passing samples
  from 05:09:02 to 15:10:04 UTC, about ten hours. The backup rollout changed
  container identities and added a fifth service, invalidating its four-service
  baseline. Twelve subsequent samples at the reviewed checkpoint failed that
  baseline assertion. Those samples are neither an application-outage finding
  nor successful observation of the new deployment. A separate check at
  16:16:56 UTC found all five services healthy, zero restarts or OOM events, a
  fresh worker heartbeat, no failed queued jobs, and no app/worker error-level
  JSON log entries since the current containers started. The maintainer accepts
  this evidence in place of the usual 24-hour staging gate for this candidate.
- **Device and accessibility coverage.** The full physical iPhone/iPad/Android
  and branded Chrome/Edge/Firefox/Safari matrix was not completed. Automated
  engine coverage does not replace it. Exact versions for the maintainer's
  phone and Mac checks were not supplied. VoiceOver acceptance covers the
  guided Settings/email-dialog smoke test, not every workflow or other screen
  readers. Physical keyboards, safe areas, zoom, and update behavior beyond
  the reported normal phone use remain unverified where only fixtures exist.
- **Provider and retailer coverage.** Normal real email delivery was confirmed;
  every invitation, email-change, closure, failure, and retry scenario was not
  individually confirmed against the live provider. Installation-specific
  optional-provider linking, consent, outages, SMS STOP/budget behavior, and
  the advertised-shop/variant matrix remain unverified beyond existing test
  fixtures. This record does not classify untested optional providers as
  disabled or certify every retailer. Capture, repeated events, gift privacy,
  account lifecycle, and offline/update scenarios retain their automated
  coverage; a complete deployed hands-on pass of each was not performed.
- **Recovery and monitoring coverage.** Off-host restoration and credential
  custody rely on the maintainer's confirmation. The observed notification
  test exercised scheduled-task failure delivery, not a failed storage upload
  or loss of the Coolify host. Initial manual health-task executions passed;
  their scheduled recurrence was not observed during this sign-off. Live
  post-snapshot account/access reconciliation remains an operator recovery
  responsibility, with automated drill coverage rather than a production
  incident test.

No unresolved application blocker was identified by the checks performed.
Untested combinations can still reveal issues. Record new failures and rerun
affected checks if the candidate's behavior or deployment changes.

## Release request and approval boundaries

The sign-off commit and PR body request `Release-As: 1.0.0`. Preserve that footer
in the eventual squash merge. Package versions, the release manifest, and the
generated changelog remain under Release Please's control.

1. Review this sign-off PR and its checks. Leave it unmerged until the maintainer
   separately authorizes merging it.
2. After that approved merge, let Release Please update the existing generated
   release PR #178 to `chore(main): release 1.0.0`. Verify package and lockfile
   versions, manifest, changelog, and publication notes. Run full CI on its exact
   final head and assess changes against the accepted revision.
3. Obtain separate approval before merging the generated release PR. That merge
   starts tagging, full release CI, image verification, and automatic publication;
   there is no later manual publication stop.
4. After successful publication, verify the final public image digest in staging.
   Obtain a fresh verified backup and separate production deployment approval,
   promote that same digest, and record authentication, privacy, existing-data,
   upload, and worker smoke checks.

The version PR's final CI, tagged release checks, public-image verification, and
production rollout remain future work. This sign-off does not mark them passed.

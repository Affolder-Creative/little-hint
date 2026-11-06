# 1.0 release readiness

Status: not ready for publication. This record starts the stabilization work;
it does not certify 1.0.0 or authorize deployment.

The starting baseline is published `v0.19.4`, commit
`fa2487ee96dfd8f62fb709d1f52a3f07a3ca19e7`. Its
[release workflow](https://github.com/Affolder-Creative/little-hint/actions/runs/42142897868)
passed all eleven browser suites, integration checks, and both architectures.
Those results belong to that release, not the eventual 1.0 candidate.

## Acceptance record

Each gate needs the tested commit or image digest, date, tester, result, and an
evidence location. Record device/OS/browser versions for device checks. Keep
credentials, domains, account identities, database contents, and recovery
locations in the private operator record. Public evidence must be sanitized.
Use Passed, Failed, Pending, or Not applicable with a reason. A skipped test or
an unavailable device is not a pass.

| Gate                            | Status  | Required evidence                                                                                                      |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full candidate CI               | Pending | Quality, database, all browser suites, both architectures, audits, licensing, source bundles.                          |
| Published-image upgrade         | Pending | 0.19.4 to candidate; retained records, amounts, files, privacy, auth, repeated migration, worker restart.              |
| Isolated backup recovery        | Pending | Restored database and upload hashes; invalidated sessions; reconciliation of closures and access changes.              |
| Off-host recovery               | Pending | Actual off-host destination restored into separate storage, backup health and failure alerts checked.                  |
| Physical iPhone, iPad, Android  | Pending | Install, sign-in, authorized links, relaunch, keyboard/safe areas, network interruption, update safety.                |
| Desktop browser matrix          | Pending | Current stable Chrome, Edge, Firefox, Safari with exact versions recorded.                                             |
| Accessibility                   | Pending | Keyboard, real screen reader, enlarged text, focus, dialog cancellation, light/dark and narrow layouts.                |
| SMTP                            | Pending | Real sign-in, invitation, email-change and closure messages; delivery failure and retry.                               |
| Optional providers              | Pending | Enabled channels tested for linking, consent, delivery and outage; disabled channels recorded explicitly.              |
| Retailer capture                | Pending | Advertised shops, blocked/variant links, editable results, failed lookup and manual entry.                             |
| Impeccable final pass           | Pending | Combined account controls and critical flows, rendered responsive states and recovery paths.                           |
| Candidate staging               | Pending | At least 24 hours with synthetic accounts; worker retries, scheduled processing, no unresolved release blockers.       |
| Private vulnerability reporting | Passed  | GitHub setting enabled and read back as `enabled: true` on 2026-11-05. SECURITY.md links to the private advisory form. |

Automated work can proceed while the maintainer completes physical-device and
provider checks. Use synthetic accounts. Live messages and paid requests require
authorized test destinations and provider budgets; CI uses controlled providers.

## Publication and deployment

Resolve privacy failures, data loss, crashes, blocked core workflows, and blocking
review feedback before approving the release PR. Record smaller known limitations
with their impact rather than hiding them behind a passing aggregate status.

The final readiness PR will request `Release-As: 1.0.0`. Do not add that override
or merge an intermediate release PR before acceptance is complete. Keep Release
Please's generated branch and title. Verify package/lockfile versions, manifest,
changelog, and checks on the final PR head.

The tagged commit must pass the full release workflow before publication. Then
verify the final public image digest in staging and promote that same digest to
production with a fresh verified backup. Publication does not deploy the app.
Record post-deployment authentication, privacy, existing-data, upload, and worker
checks privately. Do not mark this record complete merely because a tag exists.

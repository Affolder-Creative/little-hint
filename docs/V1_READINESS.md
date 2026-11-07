# 1.0 release readiness

Status: the maintainer accepted the candidate with documented exceptions on
November 6, 2026. The [final sign-off](V1_SIGNOFF.md) identifies the tested
revisions, evidence, shorter observation, and remaining validation limits.
The maintainer authorized requesting 1.0.0, with no merge, publication, or
deployment authorized yet. Final release-head checks remain pending.
The latest published version verified during this preparation is `v0.19.4`.

The starting baseline is published `v0.19.4`, commit
`fa2487ee96dfd8f62fb709d1f52a3f07a3ca19e7`. Its
[release workflow](https://github.com/Affolder-Creative/little-hint/actions/runs/42142897868)
passed all eleven browser suites, integration checks, and both architectures.
Those results belong to that release, not the eventual 1.0 candidate.

## Completed stabilization work

| Work                                 | Merged PR                                                         | Evidence                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support and recovery expectations    | [#177](https://github.com/Affolder-Creative/little-hint/pull/177) | [Support policy](SUPPORT.md), operations and release guidance.                                                                                                                                                                                    |
| Published-image upgrade verification | [#179](https://github.com/Affolder-Creative/little-hint/pull/179) | [Upgrade and recovery drill](UPGRADE_VERIFICATION.md), run in container CI and release-image checks.                                                                                                                                              |
| Critical workflow stabilization      | [#180](https://github.com/Affolder-Creative/little-hint/pull/180) | [Coverage inventory](CRITICAL_WORKFLOWS.md), cross-feature privacy/auth/capture regressions.                                                                                                                                                      |
| Interface and accessibility polish   | [#181](https://github.com/Affolder-Creative/little-hint/pull/181) | [CI run](https://github.com/Affolder-Creative/little-hint/actions/runs/42159643626) passed quality, all eleven browser suites, and CI gate on `da8d2fff4a2e2f8990e287dc68233d7aa48d0ac4`. Integration and containers were unselected, not passes. |

These establish the implementation baseline. Subsequent acceptance automation
and staging backup configuration were merged in PRs #183 and #184. The
[sign-off record](V1_SIGNOFF.md#candidate-and-evidence) separates candidate
results from implementation evidence and maintainer-reported checks.

## Acceptance record

The table summarizes the [completed candidate sign-off](V1_SIGNOFF.md).
"Accepted limitation" records the maintainer's release decision, not a passing
test. The [worksheet](V1_ACCEPTANCE.md) retains the default gate requirements.

Each gate needs the tested commit or image digest, date, tester, result, and an
evidence location. Record device/OS/browser versions for device checks. Keep
credentials, domains, account identities, database contents, and recovery
locations in the private operator record. Public evidence must be sanitized.
Use Passed, Failed, Pending, or Not applicable with a reason. A skipped test or
an unavailable device is not a pass.

| Gate                            | Result                           | Evidence and limits                                                                                                                                                                                   |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full candidate CI               | Passed                           | Full CI 42250751328 on main `906f910`; final version-PR and tagged-release CI remain pending.                                                                                                         |
| Published-image upgrade         | Passed, automated scope          | 0.19.4 upgrade/recovery checks passed on both architectures in candidate CI.                                                                                                                          |
| Isolated backup recovery        | Passed, synthetic scope          | 22 application record kinds and 26 uploads restored and compared in separate temporary storage. Live reconciliation remains an operator responsibility.                                               |
| Off-host recovery               | Passed by maintainer report      | Successful backup/restore and off-host credential custody confirmed. Scheduled-task failure email delivery observed; hourly health tasks enabled and their first manual runs passed.                  |
| Physical iPhone, iPad, Android  | Accepted limitation              | Normal phone/installed-app use passed by maintainer report; full physical-device matrix and exact versions remain unverified.                                                                         |
| Desktop browser matrix          | Accepted limitation              | Three-engine fixtures passed; full branded-browser matrix remains unverified.                                                                                                                         |
| Accessibility                   | Scoped pass; accepted limitation | Guided Mac/Chrome VoiceOver check passed by maintainer report, alongside automated keyboard, layout, and axe coverage. Other screen readers and the complete physical-device scope remain unverified. |
| SMTP                            | Scoped pass; accepted limitation | Normal real email delivery confirmed; every live message type and failure/retry path was not individually verified.                                                                                   |
| Optional providers              | Accepted limitation              | Installation-specific linking, consent, delivery/outage, and SMS behavior remain unverified beyond fixtures. No claim that untested providers are disabled.                                           |
| Retailer capture                | Accepted limitation              | Automated capture/recovery coverage passed; full live retailer/variant matrix remains unverified.                                                                                                     |
| Impeccable final pass           | Passed, rendered/fixture scope   | Combined controls and critical flows reviewed in PR #181; subsequent three-engine candidate fixtures passed. Physical-device limits remain explicit.                                                  |
| Candidate staging               | Accepted shorter observation     | About ten hours of clean samples plus healthy checks after the backup rollout; no 24-hour pass claimed. See the sign-off for baseline mismatches and the approved exception.                          |
| Private vulnerability reporting | Passed                           | GitHub setting enabled and read back as `enabled: true` on 2026-11-05. SECURITY.md links to the private advisory form.                                                                                |

Automated work can proceed while the maintainer completes physical-device and
provider checks. Use synthetic accounts. Live messages and paid requests require
authorized test destinations and provider budgets; CI uses controlled providers.

## Publication and deployment

Resolve privacy failures, data loss, crashes, blocked core workflows, and blocking
review feedback before approving the release PR. Record smaller known limitations
with their impact rather than hiding them behind a passing aggregate status.

The original copy/readiness PR did not request a version override. The final
sign-off PR now requests `Release-As: 1.0.0`, with package versions left to
Release Please. Apply the [accepted candidate-specific exceptions](V1_SIGNOFF.md#accepted-exceptions-and-remaining-validation-limits)
to the sequence below. They do not waive final version-PR CI, tagged release
checks, or public-image verification. No merge or publication is authorized by
preparing the sign-off PR.

1. Merge the reviewed copy/readiness PR, then select a full commit SHA on `main`
   for acceptance. Keep unrelated feature work out of that candidate. Run the
   full manual CI workflow for the selected revision; selective PR CI is not
   sufficient evidence for the full-candidate gate.
2. Build and deploy that revision to isolated staging using synthetic accounts.
   Record the image digest and complete the pending gates above, including at
   least 24 hours of candidate staging. Use the
   [acceptance worksheet](V1_ACCEPTANCE.md) for reproducible checks and evidence.
   The private staging image is an acceptance aid, not the public release image.
3. After the maintainer records acceptance and approves moving to 1.0, use a
   focused follow-up PR to record the decision and request `Release-As: 1.0.0`.
   Keep the existing Release Please PR open until then. Keep its generated
   branch and `chore(main): release 1.0.0` title.
4. Review the generated release PR's package/lockfile versions, manifest,
   changelog, and exact final head. Run full CI on that head. Compare it with
   the accepted revision and rerun affected acceptance checks for any behavior
   or deployment changes. Review the [draft publication notes](V1_RELEASE_NOTES.md)
   alongside the generated changelog; do not overwrite generated asset links.
5. Only merge the release PR when all pre-publication evidence is accepted.
   Its merge starts automatic tagging, full release CI, image verification,
   and publication. There is no later manual approval stop in that workflow.

The tagged commit must pass the full release workflow before publication. Then
verify the final public image digest in staging and promote that same digest to
production with a fresh verified backup. Publication does not deploy the app.
Record post-deployment authentication, privacy, existing-data, upload, and worker
checks privately. Do not mark this record complete merely because a tag exists.

## Upgrade verifier implementation evidence

The [published-image verifier](UPGRADE_VERIFICATION.md) passed locally on ARM64
against the pinned 0.19.4 baseline and a candidate built from main after PR #177.
It checked core records and amounts, authenticated privacy views, uploaded bytes,
repeatable migration, container recreation, queued work, a new gift write, and
recovery into separate storage with session invalidation. This is tooling
validation, not acceptance of the eventual 1.0 candidate. Both architecture CI
results and the final candidate run must still be recorded. Off-host restoration
and real post-snapshot access reconciliation remain pending.

## Critical workflow stabilization evidence

The [critical workflow coverage inventory](CRITICAL_WORKFLOWS.md) records the
existing suites and new cross-feature regressions. Local validation passed 868
unit tests and 38 PostgreSQL integration tests. The final account integration
changes also passed a focused ten-test rerun. All 141 tooling tests, typecheck,
and production build passed. Database-dependent tests skipped in the ordinary
unit run are not counted as passing there.

The CI selector now runs the integration job when any integration-test file
changes; six database-only paths failed regression checks before this correction.
Guardian handoff/closure privacy, capture recovery into a repeated event, and
export access after identity changes are covered without application changes.
Full CI on the final PR head and final 1.0 candidate acceptance remain required.

## Interface and accessibility polish evidence

The Impeccable pass retained the existing design and reviewed rendered account
controls, browsing, gift entry, buying, exchanges, and settings in light and dark
themes. Account export, email change, and closure were checked together at 320,
393, 768, and 1440 CSS pixels. Existing error, retry, restricted-access, empty,
draft, and confirmation paths were exercised by the browser polish suites.

Regression tests reproduced lost focus when restarting email verification and
account closure, plus a clipped code field in short dialogs. Account steps now
restore focus, and compact form dialogs scroll headings, fields, and actions
together.
Closure also positions its focused warning or code field after the new step is
laid out, including WebKit's retained scroll position. Tests cover a short window,
a simulated keyboard viewport, doubled text, Escape cancellation, return to the
keyboard opener, and the unchanged code-plus-DELETE closure safeguards.

Local validation passed the 28-test production polish suite, the account suites
in Chromium and WebKit, and 12 production offline/reconnect/update checks.
Account export and email dialogs now also run axe checks across both themes and
all four widths. The account API fixtures disable service workers; separate PWA
tests exercise actual workers and cache recovery. Screenshots are emitted by
the corresponding Playwright specs for visual review.

This is implementation evidence, not final candidate acceptance. Physical mobile
keyboards, browser zoom, installed-app behavior, real screen-reader use, and the
full supported desktop-browser matrix still require the acceptance record above.

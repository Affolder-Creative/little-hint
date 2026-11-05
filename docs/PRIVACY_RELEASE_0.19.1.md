# Privacy release readiness for 0.19.1

This patch corrects promised privacy behavior. It follows 0.19.0 and retains the normal Release Please pipeline. The three fix PRs do not publish a release or deploy the app.

## Changes

- Spending uses recipient controllers, including guardians and joint recipients. Only me removes partner access to source-linked plans and financial records while preserving the payer's history.
- Exchange assignment context survives navigation and refresh. Reservations and direct purchases validate that context on the server. Ordinary gifts remain an explicit option.
- Notes retain their audience before reservation and after release. Mention candidates, edits, inbox counts, and delivery respect the same audience.
- Only older records with evidence of exchange ambiguity need owner review. Their contents remain stored. No database reset or blanket rewrite is required.

See [spending privacy](SPENDING_PRIVACY.md), [exchange privacy](EXCHANGE_PRIVACY.md), and the [original audit](PRIVACY_AUDIT.md).

## Review and merge order

1. Review and merge [PR #168](https://github.com/Affolder-Creative/little-hint/pull/168), `fix/spending-surprise-privacy`.
2. Rebase [PR #169](https://github.com/Affolder-Creative/little-hint/pull/169), `fix/exchange-surprise-privacy`, onto main, retarget its PR to main, and rerun the required checks. Then merge it.
3. Rebase `fix/privacy-release-readiness` onto main, retarget its PR to main, rerun checks, and merge it.
4. Keep the generated Release Please PR open until all three fixes are merged. Review its final 0.19.1 version, changelog, and successful checks before merging it.

The implementation branches are stacked so each PR initially shows only its own changes. Squash merging a parent requires rebasing its child before retargeting. Do not merge children into their temporary parent branches. No branches have been merged by this work.

The readiness commit contains `Release-As: 0.19.1`. Preserve that footer in its squash commit if a version override is needed. Confirm that the generated PR updates package.json, both package-lock version fields, the release manifest, and the changelog consistently. Follow [RELEASING.md](RELEASING.md); do not manually tag these branches or bump only the PR title.

## Verification

Local combined verification passed 808 unit tests, 38 PostgreSQL integration tests, 13 browser checks, and 123 tooling checks, plus typecheck and production build. Database tests skipped during the unit run were executed separately. The release-readiness browser cases also cover list navigation, deliberately changing context across refresh, new tabs, preserving an unsent note when choosing its audience, and posting after release. Check the PR runs for the final commit's result.

Run `npx tsx scripts/audit-surprise-privacy.ts` for the focused synthetic regression checks. The command must exit zero. The underlying tests run in ordinary unit CI too.

Run the real PostgreSQL integration suite separately with an isolated `little_hint_test` database. The suite includes concurrent privacy/purchase writes transaction rollback, retained schema-4 data across upgrade, repeated migration, and rejection of a newer unsupported schema. Browser CI's group-events suite includes the surprise-privacy spec at desktop and phone widths and the guardian spending case. A passing unit run with skipped database tests does not replace those checks.

Record the final CI result on each PR and on the exact release tag. Required release CI, both architecture builds, app/worker smoke checks, vulnerability scans, SBOMs, provenance, and source bundles remain enforced by the existing workflow. Do not publish a failing draft.

## Data and deployment

Before deployment, take and verify a restorable database/uploads backup. Run `node dist/server/cli.js privacy-preflight` against an authorized restored copy. It reports counts without printing private content and performs no writes. Review any actual candidates using the gift page's owner controls after the tested upgrade. Missing historical data limits what the preflight can infer.

Schema version 6 follows the spending protection at version 5. Upgrade app and worker together, with older services stopped before the migration. A rollback to older code requires a compatible database/uploads restore and can lose post-backup writes or restore closed accounts. Prefer a forward correction after new production writes exist.

Rehearse the upgrade in staging, check that financial values, note text, and record IDs survive, and then deploy the same tested image digest. Publication alone does not deploy anything. Verify the four fixed flows with synthetic accounts after deployment.

Production preflight, backup restore, physical-device notifications, and live provider delivery are operator acceptance steps. They were not performed on production by this change. Information viewed before the fix cannot be withdrawn.

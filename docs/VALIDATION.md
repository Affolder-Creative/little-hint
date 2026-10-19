# Validation and release checks

Status on 2026-10-19: implementation and local validation are complete except the checks explicitly pending below. Deployment-specific activation status belongs in each operator's private record. Do not treat automated local checks as physical-device or live-provider certification.

## Evidence

- 53 unit tests passed. They cover recipient/buyer/guardian privacy, joint owners, overlapping groups, access removal, archive behavior, quantity reductions, partial purchases, financial reconciliation, duplicates, idempotency, exchange feasibility/exclusions/balancing/anonymity, and notification permission checks.
- Six PostgreSQL 18 integration tests passed. They cover simultaneous final-unit reservations, rollback, concurrent exchange draws, access removal racing with allocation, repeated mutation keys, and persisted job retries after a worker restart. PostgreSQL 18 is the production target.
- Six Playwright browser workflows passed: real email-code sign-in and gift/buyer/privacy flow; authentication/CSRF rejection; responsive light/dark screens with axe WCAG A/AA checks; invitations, explicit profile linking, joint ownership and transfers; virtual platform-passkey registration/login; and worker rejection of private-network imports with manual entry available.
- Two built-PWA browser tests passed. They cover static-only caches, offline personal draft isolation/review/sign-out cleanup, installation reminders, dismissal persistence, and standalone suppression.
- Retailer extraction fixtures cover Amazon, Walmart, Target, Best Buy, and Etsy, with generic metadata/manual fallback, Amazon structured-provider/DOM fallback, CAPTCHA detection, unsafe URLs and response limits. These are controlled fixtures, not a promise that every live retailer page permits extraction.
- SMTP/Telegram/SMS tests use controlled providers and failure responses. They verify generic previews and authorization checks between delivery attempts. Core workflows and deterministic tags work without an OpenAI key.
- The production Docker Compose stack was started with app, worker, PostgreSQL 18, and the unchanged upstream backup-sidecar release. The sidecar completed doctor, encrypted backup, repository check, restore and verification. A separate restored database contained the expected four illustrative accounts and four gifts; a private uploaded file round-tripped exactly. Restore-time session/invitation invalidation passed.
- The backup drill used an encrypted local test repository. Real off-host credentials and recovery remain pending.
- Impeccable's visual review finished with disposition `ship` after responsive filter, avatar sizing and contrast fixes. Design decisions are recorded in `DESIGN.md` and `.impeccable/design.json`. Durable review screenshots are local ignored artifacts under `.local/review/`.

## Sign-in and visual refinement checks, 2026-10-18

- 65 unit tests passed, including pending sign-in storage, expiry validation, email escaping, action origins, and notification privacy. The six opt-in database integration tests were not rerun for this change.
- Eleven browser tests passed against an isolated development database. They include the six existing workflows plus sign-in recovery across refresh intervals, tab switching, same-tab reload, offline/reconnect, resend failures, expired codes, and blocked session storage.
- Both built-PWA tests passed, including offline drafts, sign-out cleanup, and installation reminders.
- Production build and type checking passed. Main views were reviewed at 1280px and 390px in light and dark themes, with 320px landing and email checks. Automated accessibility checks passed on the tested pages; this does not replace physical-device or screen-reader review.
- Sign-in, invitation, and update emails were rendered in browser previews with the actual embedded-logo bytes. Real Gmail, Apple Mail, and Outlook delivery/layout remain provider acceptance checks.
- Favicon PNGs at 16, 32, and 48px have transparent surrounding pixels and heart cutouts, with exact #AA4D37 / #F1BEAD opaque tag colors. SVG and ICO selection follows system and explicit app appearance. Installed app icons are unchanged.
- Impeccable's detector returned 94 advisory token deviations, mainly existing typography and palette variants. These were reviewed alongside the rendered pages rather than treated as 94 visual defects. Review screenshots are ignored artifacts under `test-results/polish/`.

## Group events checks, 2026-10-18

- Based on `main` at `ae8ed89`, including PR #3’s release automation and licensing checks. The `group-events` browser suite is registered in both its CI matrix and isolated browser runner.
- All 111 unit tests and eight PostgreSQL 18 integration tests passed. Event coverage includes leader permissions, managed profiles, purchase privacy, membership changes, selection reconciliation, archive/restore, scheduled archiving, revision conflicts, idempotent retries, concurrent creation, and transaction rollback.
- Type checking, production build, five release-tooling tests, two source-bundle tests, license policy (291 installed packages), and Compose validation passed. No runtime dependencies were added.
- The three existing list-feature browser workflows passed after extracting the shared privacy/date form controls.
- The new multi-account group-events browser workflow passed PR #3’s isolated, paced CI runner (app and worker enabled), including owner-appointed leadership, managed profiles, unselected shoppers, Surprise privacy, settings bypass rejection, participant removal/restoration, event archive/restoration, and leader revocation.
- Desktop/mobile, light/dark, overflow, and axe accessibility checks passed. Impeccable finished with disposition `ship`; its single screenshot-shell finding was resolved with clean captures at settled viewports. The existing design system is preserved, with event-specific guidance in `.impeccable/surfaces/src-client-groupevents-tsx.md`.

## Mobile PWA layout and gift settings checks, 2026-10-19

- Type checking, production build, license policy, formatting, and diff whitespace checks passed. All 112 unit tests passed; the eight opt-in PostgreSQL integration tests were not rerun for this change.
- Chromium passed all four list-feature workflows, the group-event workflow, responsive light/dark and email-layout checks with axe, and both built-PWA tests. Final mobile-shell checks also passed in WebKit, along with the existing list-date locking and archive workflow.
- Mobile checks cover 320px and 393px portrait widths, landscape, simulated safe-area insets, short and long pages, navigation padding and enlarged labels, desktop reset, and blank/populated native date controls in personal-list and group-event dialogs. Footer clearance responds to the measured navigation height. Screenshots were reviewed in both themes and on desktop; final evidence is ignored under `.local/browser-evidence/`.
- A new domain regression confirms that ordinary purchases and contributor names reveal on Surprise event lists without the secret-exchange opt-in, after the selected day ends in the list timezone. Recipient/guardian access and exclusion of contribution amounts remain enforced.
- Impeccable documentation was refreshed in `DESIGN.md` and `.impeccable/design.json`, retaining the established identity. The detector reported the same 94 advisory token deviations; the rendered layouts and canonical metadata were checked.
- Physical iPhone testing on the reported iOS 27.0.1 remains pending. Desktop WebKit and simulated safe areas do not reproduce the installed PWA's native status-bar compositor, so they cannot certify that the reported blur is gone.

## Native iOS date controls, 2026-10-19

- An isolated WKWebView harness rendered the real list-policy component and CSS in the iOS 27.0 iPhone 17 Pro simulator. The previous CSS reproduced 26px of overflow on both date controls at 288px and 361px dialog widths, with blank and populated values. The date-only appearance reset produced exact field-width alignment in every case.
- The native iOS calendar still opened, accepted a changed date, and updated the React-controlled field. Tapping the exchange-checkbox label selected it. Blank dates disabled the checkbox; populated dates enabled it. Disabled checkboxes now use muted labels and faded controls, with the date prerequisite first in the accessible help text.
- Type checking, production build, and all 112 unit tests passed. All five Chromium list-feature workflows passed, including a new touch regression for personal-list and group-event forms that verifies checkbox toggling and omission from submitted form data after clearing the date. Eight opt-in database integration tests were not rerun.
- WebKit passed the touch regression and the saved-list date-locking/archive workflow, including confirmation that exchange inclusion persists after saving. Desktop and mobile screenshots were reviewed.
- The simulator is iOS 27.0, not the reported physical iPhone running 27.0.1. The native-engine reproduction adds evidence beyond desktop WebKit but does not certify physical-device behavior.

## Commands

```sh
npm run typecheck
npm test
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:54330/little_hint_test npm run test:integration
npm run build
npx playwright test tests/e2e.spec.ts
E2E_BUILT=1 E2E_BASE_URL=http://localhost:4173 npx playwright test tests/pwa.spec.ts
```

Use a separate database named `little_hint_test`; integration tests clear its application data. Browser tests require seeded development accounts and the app/worker described in the README. Email codes use private local mail files outside production. Repeated browser runs can hit the real email-code rate limiter; wait for its window rather than disabling protection.

## Required before broad production use

- Configure and verify Forward Email SMTP and sender DNS. Test successful code delivery and provider failure. Bootstrap the first administrator after SMTP is ready.
- Configure separate off-host backup repository credentials, enable the sidecar and schedules, and complete a restore drill using that destination. Verify failure alerts and stale-backup health.
- Configure optional Telegram and Twilio services, verify linking/opt-in/STOP and real delivery, and set usage budgets. Confirm behavior while each provider is unavailable.
- Exercise live product URLs from all five named retailers, including regional/variant/blocked pages. Document provider limitations and confirm manual entry stays available.
- On physical iPhone, iPad, and Android devices: install, launch from the icon, authenticate, follow authorized deep links, close/relaunch, and check session behavior. Confirm icon masking and clear space. Verify Apple instructions and embedded-browser guidance with no native install event.
- Check keyboard-only operation, a real screen reader, enlarged text, narrow widths, landscape, safe areas, and the on-screen keyboard. Automated axe checks do not replace these.
- Verify a service-worker update with an active form and purchase request. Confirm the update waits, preserves local drafts, and applies after a safe user action. Test interrupted networks and reconnection on real devices.
- Verify production DNS/TLS, migrations on an empty database, persistent volumes across redeploys, worker health, job retries, and an authorized backup restore with access changes reconciled.

No physical-device, real SMTP/SMS/Telegram, live retailer success, or off-host restore claim is made until those checks are recorded.

## CI and release automation checks, 2026-10-18

- Type checking and the production build passed. All 97 unit tests, seven PostgreSQL 18 integration tests, and five release-tooling tests passed.
- All 16 browser tests passed against the built app: six core workflows, four sign-in workflows, three list-feature workflows, one responsive/email-layout test, and two PWA tests. Each suite used a fresh isolated database, managed Chromium, and a pacing proxy that preserved the real server rate limit.
- AMD64 and ARM64 images built and passed app/worker health, non-root operation, public notices, native Sharp image processing, and repeatable migrations. Trivy 0.76.0 reported zero fixable high/critical findings for both final images. Unused npm/Corepack/Yarn tools were removed from distributed runtime layers after the initial scan found three high-severity npm-tooling findings.
- Production npm audit found zero vulnerabilities. Application and brand npm notice inventories and the two pinned Python brand-tool notice checks passed. Compose overlay checks, actionlint 1.7.12, shell syntax checks, and release guard tests passed.
- The actual ARM64 image produced 45 required corresponding-source identifiers. Publication correctly failed with the empty source manifest. This verifies the blocker, not compliance clearance. Complete the work in [LICENSING.md](LICENSING.md) before publishing images.
- No GitHub Release or GHCR package was published during local validation. The GitHub-hosted workflows and registry publication path require their own successful runs; local checks alone do not prove publishing permissions or registry availability.

## Corresponding-source review, 2026-10-18

- Both actual runtime inventories pass source coverage: 45 exact identifiers per architecture, 47 distinct identifiers in total. This supersedes the earlier empty-manifest blocker.
- Three bundles contain 641 pinned downloads, including 590 Rust crate inputs, the seven Alpine origin recipes, native sources, patches and build instructions. Alpine source/patch SHA-512 checks, Cargo.lock checksums, native patch application and offline Cargo metadata checks passed. Sharp's offline workspace update added/upgraded no crates.
- Complete bundle bytes match between macOS/Python 3.14 and Linux/Python 3.12 with network disabled. The reviewed hashes are in `compliance/source-bundles.lock.json`. Both architecture gates accept those hashes.
- Tests reject missing version coverage, path traversal, duplicate input paths, insecure source URLs, changed download bytes and corrupt caches. Archive contents and deterministic packaging are exercised. PR CI now assembles and verifies sources against each newly built image.
- This validates source/build-input coverage and packaging. It does not claim bit-identical upstream binary rebuilds or publication of a GitHub Release/GHCR image during this review.

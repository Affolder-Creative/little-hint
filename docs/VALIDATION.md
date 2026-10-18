# Validation and release checks

Status on 2026-10-18: implementation and local validation are complete except the checks explicitly pending below. Deployment-specific activation status belongs in each operator's private record. Do not treat automated local checks as physical-device or live-provider certification.

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

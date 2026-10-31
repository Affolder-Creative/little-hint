<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/little-hint/logos/little-hint-horizontal-dark.svg">
  <img src="public/brand/little-hint/logos/little-hint-horizontal-color.svg" alt="Little Hint" width="320">
</picture>

# Little Hint

**Gift ideas, shared thoughtfully.**

A self-hosted, invite-only gift coordination PWA for families and friends. React/Vite frontend, Fastify API, PostgreSQL/Drizzle, Better Auth, and a pg-boss worker. Includes leader-managed group events with individual wish lists, wishes, private ideas, quantities, contributions, secret gift exchanges, URL imports, and optional SMTP/Telegram/US SMS integrations.

Family-group owners and designated event leaders create and manage all gift
exchanges in their group, including existing exchanges created by other members.
The creator remains recorded, but management follows current group roles.
Households provide optional matching exclusions; they do not own exchanges.

With OpenAI configured, product imports clean up titles, summarize descriptions
into 1–3 factual sentences, and suggest tags. Review and edit the copy before
saving. Imports retain retailer data if AI is unavailable, and saved items are
not rewritten automatically.

Exchanges and group events can have an optional USD spending guideline for each
giver and recipient. Buying views estimate your total across gifts and your share
of group-event gifts, and flag shared gifts whose full cost exceeds the guideline.
These notices never block a purchase or contribution. Totals use accessible gift
plans, listed prices, and promised contributions, without tax or shipping. The
buyer's contribution goal still prevents overfunding; secret-exchange gifts do
not support cost sharing. Group owners and event leaders can update a drawn
exchange's guideline without changing assignments.

The [master plan](MASTER_PLAN.md) is the approved product contract. Read [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), and [validation/release checks](docs/VALIDATION.md) before deployment. Production activation and physical-device acceptance still require the checks recorded there.

## Release status and support

Little Hint is an early 0.x release. It is source-available and free to self-host
for personal use under [PolyForm Perimeter 1.0.0](LICENSE), which restricts
competing products and services. You provide and pay for your own server, email
service, and any optional providers. See [licensing](docs/LICENSING.md) for details.

Expect changes before 1.0. Back up the database and uploads before upgrading and
read the release notes, including any migration or rollback instructions. Bug
reports are welcome through GitHub Issues; support is provided as time allows,
with no response-time or uptime guarantee. Security fixes target the latest
released version. Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).

Start with the [installation guide](docs/DEPLOYMENT.md). Review the outstanding
[device, provider, and recovery checks](docs/VALIDATION.md#required-before-broad-production-use)
before relying on an installation for real gift plans.

## Local development

Requires Node.js 24+, npm, and PostgreSQL 18 (Docker is convenient).

```sh
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the first generated value in `BETTER_AUTH_SECRET`, the second in `SETTINGS_ENCRYPTION_KEY`. Never commit `.env`. Start a local database:

```sh
docker run -d --name little-hint-dev-db \
  -e POSTGRES_USER=little_hint -e POSTGRES_PASSWORD=little_hint_dev \
  -e POSTGRES_DB=little_hint -p 127.0.0.1:54329:5432 postgres:18-alpine
npm run db:migrate
npm run bootstrap -- you@example.com
npm run dev
```

In a second terminal:

```sh
npx tsx src/server/worker.ts
```

Open **http://localhost:5173**. `APP_URL` must match the origin you use, including hostname and port. API mutations reject other origins.

With SMTP unset outside production, sign-in codes and notifications go to private `.local/mail/*.json` files. Read the newest file addressed to your development email. They are never logged to the console. Production has no local-mail fallback.

For illustrative fixtures on an **empty development database**, run `npm run demo` instead of bootstrap. Sign in as `alex@example.test`, `sam@example.test`, `jamie@example.test`, or `riley@example.test` using the real email-code flow and local mail files. Demo seeding is disabled in production and does not run automatically. UI labels the example accounts as development data.

## Container deployment

```sh
cp .env.production.example .env.production
# Fill LITTLE_HINT_IMAGE with a verified release digest, plus runtime settings.
docker compose --env-file .env.production -f compose.production.yaml up -d
docker compose --env-file .env.production -f compose.production.yaml exec app \
  node dist/server/cli.js bootstrap you@example.com
```

Use `/compose.production.yaml` for Coolify production and `/compose.staging.yaml`
for staging. Both are standalone registry deployments. Set Custom Build Command
to `true`, leave Custom Start Command empty, and configure runtime-only variables.
Follow [Coolify release upgrades](docs/COOLIFY_UPGRADES.md) to preserve existing
production data when switching files and to promote the same tested image digest.

Optional local/source builds still use `compose.build.yaml` to build without
runtime settings, then `compose.yaml` to run the image. Keep those commands
separate; see [operations](docs/OPERATIONS.md#optional-source-build-installation).
The existing `compose.ghcr.yaml` registry overlay remains supported with
`compose.yaml`. Use `compose.local.yaml` only when a loopback host port is needed;
`compose.preview.yaml` belongs to the preview launcher.

`app` migrates before starting. `worker` waits for app health. Both use the same non-root image. The optional Housewatch Digital backup sidecar has its own image, credentials, health check, and schedules. The example leaves it disabled; configure a backup method and verify a restore before storing important data. PostgreSQL and uploads persist in separate volumes. Configure Coolify's domain/proxy for app port 3000, with HTTPS and your public origin as `APP_URL`, for example `https://littlehint.example.com`. See the operations guide for Coolify environment configuration, provider setup, and backups.

Configure the SMTP sender independently from the app URL. An alias on an existing verified email domain is sufficient, for example `Little Hint <littlehint@example.com>`. All `example.com` addresses in this repository are placeholders. Keep real domains, administrator emails, resource IDs, credentials, and deployment records in ignored `.env.production` or `.local/deployment/` files, or your deployment platform's settings. Use the [deployment checklist](docs/DEPLOYMENT.md) for each installation.

See [SMS setup](docs/SMS.md) for Textbelt or Twilio, phone sign-in, consent, budgets, and real staging delivery.

See [notification setup and behavior](docs/NOTIFICATIONS.md) for browser push, inbox preferences, mentions, following, and device badges.

## Synthetic preview

With Node.js 24+ and Docker with Compose running, start a built preview from the
repository root. No local application dependencies or `.env` setup are needed.

```sh
npm run preview                # Local app and test inbox
npm run preview -- --share     # Fresh public HTTPS link for iPhone/device testing
npm run preview:status         # URLs, accounts, and service health
npm run preview:stop           # Stop; keep data
```

Sign in as `alex@example.test` or `sam@example.test` and retrieve the email code
from the printed inbox URL. Each checkout has isolated synthetic data that survives
restarts. Run `npm run preview:reset` to confirm a reset. Shared links also expose
the test inbox, so use only synthetic data. Keep your Mac and Docker running.
See [the preview guide](docs/PREVIEW.md) for logs, persistence, limitations, and troubleshooting.

## Development checks

```sh
npm run typecheck
npm test
npm run build
npm run test:compose # Requires the Docker Compose CLI; no running daemon or database.
```

Integration tests require a separate database literally named `little_hint_test`; they refuse other names and clear its application records:

```sh
docker exec little-hint-dev-db createdb -U little_hint little_hint_test
TEST_DATABASE_URL=postgres://little_hint:little_hint_dev@localhost:54329/little_hint_test npm run test:integration
```

Browser tests use the running development app/worker and illustrative accounts. They add test gifts. Install the matching browser with `npx playwright install chromium`. Set `CHROME_PATH` only to override Playwright's managed Chromium.

```sh
npm run test:e2e
```

The PWA service worker is generated by `npm run build`, not enabled during Vite development. To test the built PWA with local development mail, use a separate terminal:

```sh
NODE_ENV=test APP_URL=http://localhost:4173 PORT=4173 node dist/server/index.js
E2E_BUILT=1 E2E_BASE_URL=http://localhost:4173 npx playwright test tests/pwa.spec.ts
```

`localhost` is a browser secure-context exception. Real devices need HTTPS. See validation notes for tests that require actual devices/provider accounts.

## Project layout

The standalone marketing website lives in `marketing/`. See the [GitHub Pages setup and screenshot guide](docs/MARKETING.md) for preview, validation, and publishing instructions.

- `src/client`: responsive application, forms, install guidance, drafts.
- `src/server/domain.ts`: permissions, projections, transactional commands.
- `src/server`: auth, persistence, exchange solver, imports, channels, jobs.
- `src/shared/model.ts`: shared typed records and safe response types.
- `public/brand/little-hint`: approved runtime branding; `brand/` preserves sources/license.
- `tests`: domain/import/security, PostgreSQL, and browser tests.
- `docs`: deployment, recovery, and validation evidence.

## CI, releases, and licensing

PRs into `main` always run quality checks and select PostgreSQL, browser,
container, and brand audits from the changed files. Main merges and manual CI
runs retain full coverage. PR-title edits run only the separate title check.
Dependabot opens maintenance PRs. Release Please prepares a version and
changelog PR; merging it starts a draft release and verified AMD64/ARM64 image
publication to `ghcr.io/affolder-creative/little-hint`. See [releasing](docs/RELEASING.md)
for setup, downloads, upgrades, and failed-release recovery.

Releases include reviewed corresponding-source bundles for Alpine, Sharp's
native libraries, and Lightning CSS. CI verifies their coverage against both
actual image architectures and checks all input and bundle hashes. See
[licensing](docs/LICENSING.md) for review evidence and dependency-update steps.

Little Hint is source-available under [PolyForm Perimeter 1.0.0](LICENSE).
Copyright 2026 Affolder Creative. The license restricts competing products,
including free competitors; it is not an OSI-approved open-source license.
Third-party components retain their original licenses. Commercial permission
and [outside contribution policy](CONTRIBUTING.md) are documented separately.

## Staging

Use the [persistent staging guide](docs/STAGING.md) to test feature branches on a separate server with synthetic data and a private Mailpit inbox. Images are built manually in GitHub Actions and deployed by digest; production data and credentials stay separate.

For paid shop lookups, see [Bright Data setup](docs/bright-data.md), including production and staging credentials, the Web Unlocker zone, retailer scrapers, and verification.

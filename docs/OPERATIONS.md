# Operations and recovery

For feature testing with synthetic data, use the [isolated staging setup](STAGING.md).

## Coolify deployment

Use the standalone `/compose.production.yaml` for production and
`/compose.staging.yaml` for isolated staging. Both pull prebuilt registry images;
app and worker use the same digest in each environment. Follow
[Coolify release upgrades](COOLIFY_UPGRADES.md) for verification, promotion, and
transitioning the existing production resource without replacing its database.

Connect the repository with the Compose build pack in normal Coolify-managed
mode. Set **Custom Build Command** to `true` and leave **Custom Start Command**
empty. There are no images to build, and skipping the build phase keeps required
runtime secrets out of build-time Compose parsing. Keep automatic and preview
deployments disabled. Configure Runtime-only variables from the matching example
file, including `LITTLE_HINT_IMAGE` for production or `LITTLE_HINT_STAGING_IMAGE`
for staging. Use a verified digest, not a moving tag.

Set the production app service domain to `https://littlehint.example.com:3000`.
Coolify supplies HTTPS through its proxy; port 3000 is an internal routing target.
`APP_URL` must be `https://littlehint.example.com`, without that port. Database and
worker remain private. Staging also routes a separate authenticated Mailpit domain
to port 8025; follow its [certificate and setup instructions](STAGING.md).

These settings use [Coolify's standard Compose deployment](https://coolify.io/docs/applications/builds/docker-compose).
Review its generated configuration before deployment, especially persistent volume
identities when changing an existing resource's Compose location.

### Optional source-build installation

For installations intentionally building on the deployment server, keep Docker
Compose Location set to `/compose.yaml`. Set Coolify's **Custom Build Command** to:

```sh
docker compose --env-file /dev/null -f compose.build.yaml build
```

Leave Custom Start Command empty so Coolify starts its generated runtime Compose file with the correct domains, labels, networking, and environment. The build file only produces `little-hint:local`; both runtime services use that image with `pull_policy: never`. Build and run on the same Docker host. For registry deployment, use the standalone production file and digest-pinned release bundle described in [releasing](RELEASING.md). The local-build commands in this guide remain supported.

Set application configuration variables to **Buildtime off, Runtime on**, in production and any preview configuration. This includes database/authentication/encryption secrets, SMTP, notification/import providers, and backups. Coolify-generated URL variables can stay managed by Coolify. The build file has no build arguments, env files, runtime services, or deployment secret references. `/dev/null` prevents Compose from loading a local `.env` while building.

Do not use the runtime file for the build command: Compose evaluates `${VARIABLE:?message}` even during `build`, but Coolify's build environment excludes runtime-only variables. Keep the required-variable checks in `compose.yaml`; they must still reject missing secrets when the stack starts. To verify this separation locally, run `npm run test:compose`. To force a clean image rebuild, add `--no-cache` after `build` in the custom command for that deployment, then restore the normal command.

Set runtime environment variables from `.env.production.example`. Generate a random database password and authentication secret, and a 32-byte base64 `SETTINGS_ENCRYPTION_KEY`. Keep these in Coolify's secret environment configuration and an independent password manager. Do not expose them as build arguments. App and worker use the same image. PostgreSQL 18 persists under `/var/lib/postgresql`; do not mount a PostgreSQL 17 data directory there. Major upgrades require dump/restore or a planned PostgreSQL upgrade.

For source builds outside Coolify, start the built image separately:

```sh
docker compose --env-file .env.production -f compose.yaml up -d --no-build
```

### Runtime operations

The app applies versioned migrations before it starts. The worker waits for app health, then starts the durable pg-boss queues. `/api/health` checks database connectivity. App and worker health checks run inside their containers. For local Compose access only, add `-f compose.local.yaml` after your selected production Compose file to bind localhost port 3000 or `APP_PORT`.

Bootstrap the first administrator only after SMTP works, using the app container terminal:

```sh
node dist/server/cli.js bootstrap admin@example.com
```

This creates a 24-hour invitation; it does not email a code until the administrator signs in. The command refuses a second active bootstrap. Ordinary registration requires an invitation. Do not seed demo data in production.

## Optional Cloudflare Web Analytics

Cloudflare can inject its Web Analytics beacon into proxied HTML. Little Hint
blocks external scripts and connections by default, so an injected beacon will
produce a browser CSP warning until the operator chooses to allow it.

To use analytics, set `CLOUDFLARE_WEB_ANALYTICS=true` as a Runtime-only variable
in Coolify and redeploy the app. This permits scripts from
`https://static.cloudflareinsights.com` and connections to
`https://cloudflareinsights.com`. Same-origin `/cdn-cgi/rum` reports are already
covered by `'self'`. This setting permits the beacon; it does not inject a script,
configure a Cloudflare site token, or enable analytics in Cloudflare.

Leave the variable empty, unset, or `false` to keep the original policy. Other
values fail startup. If analytics is unwanted, also disable Web Analytics beacon
injection for this hostname in Cloudflare to remove the browser warning. Do not
enable it for private app pages unless sending their page URLs and performance
metrics to Cloudflare is intended. See Cloudflare's
[data collection documentation](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
and [CSP guidance](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/).

After an approved deployment, check the HTML response's CSP and the browser
Network panel: the beacon script should load and its `/cdn-cgi/rum` request should
succeed without a CSP violation. An ad blocker may still block analytics. Keep
inline scripts, eval, unrelated script hosts, and unrelated connection hosts
blocked. No Cloudflare dashboard change is needed when injection is already on.

## Email and optional providers

Any compatible SMTP provider can send application email. For Forward Email, use `smtp.forwardemail.net`, port 465 with TLS, and an alias on a domain with verified, approved outbound SMTP. For example, use `littlehint@example.com` as `SMTP_USER`, its generated alias password as `SMTP_PASS`, and `Little Hint <littlehint@example.com>` as `SMTP_FROM`. Replace these example addresses before deployment.

The app can run at `https://littlehint.example.com` while sending from `littlehint@example.com`. An existing verified sending domain can host the alias; adding the app's subdomain as a separate Forward Email domain is unnecessary. Optionally forward incoming mail for that alias to an inbox you monitor so replies reach you. DNS for the web app does not by itself configure email delivery. Keep provider credentials out of Git, chat, screenshots, and logs.

SMTP settings must be available in the hosting environment before email-code login. All integration settings are ENV-only. The two editable app preferences remain encrypted using `SETTINGS_ENCRYPTION_KEY`; retain that key through restores.

Telegram requires a bot token and name. Account linking uses an expiring single-use code and explicit user action. Twilio requires account credentials, a sending number, and a Verify service. Configure signed status/inbound callbacks according to the routes in `src/server/app.ts`; verify a US number before enabling SMS preferences. OpenAI and paid product imports are optional. Paid integrations remain inactive without credentials. `PAID_DAILY_LIMIT` caps provider requests per UTC day, not dollars. Set provider-side budgets too.

## Existing backup sidecar

Backups use [Housewatch Digital backup-sidecar](https://github.com/Housewatch-Digital/backup-sidecar), release `0.3.0-postgres18`, source commit `d536ab480094e95ed38be90459f2d555cab3ed26`. Little Hint has no custom backup engine or scheduler. The PostgreSQL client major matches the server. The sidecar makes a logical database dump and backs up the uploads volume read-only. Never mount live PostgreSQL data as ordinary files. It has no Docker socket access.

Configure a separate Little Hint restic repository path, a new strong `RESTIC_PASSWORD`, and the storage provider's access credentials. The same storage account can host other applications, but Little Hint must have its own repository/prefix. Keep the repository password outside the backed-up server. Enable `COMPOSE_PROFILES=backup` only after these settings exist. The idle sidecar has a stale-backup health check; it is unhealthy until its first successful backup. If the registry requires authentication, configure access on the deployment server. The upstream source at the pinned release can also be built unchanged with Docker target `postgres`.

Create Coolify scheduled tasks targeting the backup container. Confirm the actual container name after deployment. Schedules use the deployment server's timezone.

| Task                     | Command                | Schedule    | Timeout      |
| ------------------------ | ---------------------- | ----------- | ------------ |
| Nightly encrypted backup | `backup-sidecar run`   | `0 3 * * *` | 3600 seconds |
| Weekly prune             | `backup-sidecar prune` | `0 4 * * 0` | 3600 seconds |
| Monthly integrity check  | `backup-sidecar check` | `0 5 1 * *` | 3600 seconds |

Set `RESTIC_KEEP_DAILY=30`, weekly/monthly retention to 0, and `BACKUP_MAX_AGE_SECONDS=93600`. This keeps 30 daily snapshots, which can span more than 30 calendar days if runs are missed. A nightly run applies retention; the separate prune removes unreferenced data. Enable Coolify failure notifications and inspect backup health. A schedule alone is not evidence of a successful backup.

Before accepting production backups, execute `backup-sidecar doctor`, `backup-sidecar run`, `backup-sidecar check`, and `backup-sidecar health` in the backup container. Then restore into a disposable database and file directory. A local encrypted-repository drill passed on 2026-10-18; the real off-host destination still requires this check.

## Restore procedure

1. Put the site into maintenance and stop the app and worker. Preserve the current database/uploads volumes and a current snapshot before changing data. Keep the backup container and database available.
2. Restore into a new empty directory under `/restore`, for example `backup-sidecar restore-latest /restore/drill-2026-10-18`. To recover a different snapshot, use the upstream sidecar's documented snapshot selection workflow. Run `backup-sidecar verify /restore/drill-2026-10-18`.
3. Inspect `.backup-sidecar/postgresql/databases.jsonl` inside that restored directory. For this single-database deployment it maps `little_hint` to `.backup-sidecar/postgresql/0001.dump`. Do not guess the mapping if the deployment changes.
4. Create a separate empty PostgreSQL 18 database for the drill, then run from the backup container, which already has database credentials in its environment:

   ```sh
   pg_restore --host=db --username=little_hint --dbname=little_hint_restore \
     --no-owner --no-acl --exit-on-error \
     /restore/drill-2026-10-18/.backup-sidecar/postgresql/0001.dump
   ```

5. Verify user/list/item totals, relational references, reservation quantities, contribution balances, and a sample of uploaded files under the restored `uploads/` directory. Restore uploaded files to a **new** volume for the drill, preserving bytes and setting ownership to the app image's `node` user. Do not overwrite the live volume during verification.
6. For an actual recovery, point app and worker at the restored database and uploads volume. Retain the original `SETTINGS_ENCRYPTION_KEY`; rotate authentication/session secrets if compromise caused the restore. Run migrations with the application version selected for recovery.
7. Before reopening access, run `node dist/server/cli.js invalidate-sessions` against the restored database. This removes sessions and verification codes, revokes invitations and pending profile/ownership/Telegram links, and disables pending notices/running imports that need reconciliation. It preserves registered passkeys, which are not sessions. Revoke them separately if account compromise is suspected.
8. Reconcile membership removals, guardianship changes, purchases, contribution payments, and cancelled exchanges that happened after the snapshot. A database restore can resurrect permissions revoked after the snapshot; session invalidation does not repair membership history. Keep the site closed until that review is complete. Reissue needed invitations and resume only reviewed jobs.
9. Start app and worker, verify authorized login and representative privacy views, then reopen access. Take a fresh off-host backup and record the drill date, snapshot, and checks. Preserve the previous volumes until recovery is accepted.

## Family-group creation

Settings → Administration → Family-group creation defaults to **Everyone signed in**. Choose **Administrators only** to restrict new groups. Existing group owners keep all management permissions, and invitations and ownership transfers remain available.

`FAMILY_GROUP_CREATION=everyone|admins` overrides and locks the UI preference. Leave it empty or unset to use the saved choice. Invalid values stop startup. Recreate app and worker containers after changing the environment override; UI changes take effect without restart. This application preference is also editable in staging without enabling external integrations. A non-administrator can ask an administrator to create a group and transfer ownership through the existing acceptance flow.

## AI gift suggestion controls and rollout

Configure gift-suggestion availability, account/week and app/month search limits, and the discovery model through these environment variables on both app and worker:

| Variable                           | Default when empty                              |
| ---------------------------------- | ----------------------------------------------- |
| `GIFT_DISCOVERY_MODE`              | `givers` (`off`, `givers`, `receivers`, `both`) |
| `GIFT_DISCOVERY_USER_WEEKLY_LIMIT` | `3`                                             |
| `GIFT_DISCOVERY_MONTHLY_LIMIT`     | `100`                                           |
| `GIFT_DISCOVERY_MODEL`             | `gpt-6-luna`                                    |

Gift-suggestion settings are configured through deployment environment variables.

A configured `OPENAI_API_KEY` is also required. A zero search limit blocks new paid searches for accounts without an applicable exception while existing eligible batches remain usable. Preview forces discovery off. Staging permits paid AI testing through dedicated `STAGING_` environment variables; see [staging AI setup](STAGING.md#paid-ai-testing). `.env.production.example` starts with `GIFT_DISCOVERY_MODE=off`; leave it off during rollout. Change deployment settings and recreate **both** app and worker containers. Clients learn the change on their normal refresh, and server guards use the new configuration after restart. Already dispatched work may still be billed. Disabling clears unsaved batches, and re-enabling does not restore them.

Usage resets Monday 00:00 UTC for accounts and the first of each month 00:00 UTC for the installation. Limits count dispatched attempts across all recipients/modes, including failures, rather than shuffles or direct price refreshes. Each attempt permits at most two web-search calls and 4,000 output tokens. Admin usage reports returned input/output tokens, search calls and a standard-rate estimate, plus attempts with unknown usage. Estimates are not a provider billing cap; reconcile actual invoices and recheck pricing before changing models. Discovery does not use `PAID_DAILY_LIMIT` or paid scraping: its weekly/monthly controls are separate.

### Per-account search exceptions

Set `GIFT_DISCOVERY_USER_OVERRIDES` on the server to a JSON object keyed by the stable authentication account ID. It is separate from editable admin settings and is never sent to browsers. Empty or `{}` means no exceptions; administrators receive no automatic exemption.

```dotenv
GIFT_DISCOVERY_USER_OVERRIDES='{"ACCOUNT_ID":{"weeklyLimit":"unlimited","bypassMonthlyLimit":true},"ANOTHER_ACCOUNT_ID":{"weeklyLimit":20}}'
```

Replace the example IDs with real account IDs. While signed in as the account, open `/api/v1/world` on the app's origin and copy `me.id`. Use the account ID, not a person's profile ID, email, or name. For another account, its user can retrieve its own ID the same way. This read requires an authenticated session.

`weeklyLimit` accepts an integer from 0 through 999999, or the string `"unlimited"`. Omitting it keeps the configured default. `bypassMonthlyLimit` accepts a boolean and defaults to false. Weekly exceptions alone still consume and obey the shared monthly allowance. A monthly exemption allows searches after the shared allowance is exhausted, including when that limit is zero. It does not waive a finite weekly limit. Exceptions cover the account's searches for all recipients, including managed profiles.

Monthly-exempt searches do not consume the shared monthly allowance. Admin reports show shared usage, exempt searches, and total searches separately. Every dispatched attempt still counts in total usage and provider reporting, including failures. Existing usage is not retroactively reclassified. Removing an exception restores normal enforcement against the account's recorded weekly usage. Only known failures before dispatch are refunded; their original exemption classification determines the refund.

The global Off switch, staging/preview isolation, audience and recipient permissions, one active search per account, and provider request bounds still apply. Unlimited means no application quota for that account, not free provider requests. The client displays the effective allowance; `null` in its weekly/monthly remaining fields means that cap does not apply.

Pass the same value to both app and worker and recreate both containers after changes. Compose forwards this variable to both services. In a hosting environment-value field, enter the JSON object without the surrounding dotenv single quotes. Invalid configuration prevents either service from starting and reports the variable name without echoing its value. No SQL migration is required; older jobs remain non-exempt, and current-month counters are preserved. Deploy the new app, worker, and client together.

Deploy app and worker from the **same image** together. Stop old writers before starting the new release: the full-state writer removes unknown application-record kinds, so an old binary can delete `giftPreferences` or `giftDiscoveryJobs`. No SQL backfill is needed, but take a database/upload backup. Before rollback, set off, stop both services, export these two kinds and retain the backup. Restore them only with a compatible binary; do not run old and new workers concurrently. Saved item offer fields are optional, and existing manual lists/items continue to work.

Before wider activation, run ten explicit searches using synthetic profiles only: coffee at $25/$50, books at $25, gardening at $50, cooking at $100, board games at $50, crafts at $25, camping at $100, one managed-profile own-list search without a maximum, and one intentionally restrictive no-match search. On the isolated staging installation with its dedicated AI key, set mode `both`, weekly limit `10`, monthly limit `10` and automatic photos off. Use the staging-prefixed environment settings documented in STAGING.md. Record verified candidate counts, exact product/variant, price and stock at each linked shop, review evidence, latency, reported usage and actual billed cost. Verify free shuffle, a changed-price refresh and cancellation during a request. All displayed offers must satisfy budget/identity/evidence requirements; empty results must be explained honestly. Investigate low verified yield before enabling the feature for users. Restore the intended limits and giver-only mode after evaluation. This paid live evaluation is not run by CI.

## Routine maintenance

Back up before migrations or dependency upgrades. Deploy app and worker from the same commit. Avoid changing `APP_URL` without also reviewing passkey relying-party IDs and allowed origins. Never delete Compose volumes as part of a redeploy. Keep the settings encryption key and restic password in an independent secure store. Treat restored data as private.

Logs deliberately omit gift content, buyer discussions, assignments, and secrets. Use operational job IDs and status codes to investigate failures. Rate limiting currently sees the proxy address; review limits before substantially increasing the number of simultaneous users. This app enforces privacy through server permissions, not end-to-end encryption from its operator.

## Product import providers

Direct HTML import runs first. If the title is missing, or the image URL is missing while automatic photo imports are enabled, Little Hint makes at most one paid provider request. Configure API keys only through `SCRAPINGFISH_API_KEY`, `SCRAPINGBEE_API_KEY`, `SCRAPEDO_API_KEY`, and `SCRAPINGDOG_API_KEY`. Provider credentials are never returned to the browser.

`SCRAPING_PROVIDER` accepts `auto`, `none`, `scrapingfish`, `scrapingbee`, `scrapedo`, or `scrapingdog`. An empty environment variable uses the built-in automatic selection. Automatic selection chooses the first configured provider in this order: Scraping Fish, ScrapingBee, Scrape.do, Scrapingdog. It does not try a second provider when the selected provider fails. An explicit selection without its key uses direct import only. `none` disables paid scraping. Staging requires dedicated `STAGING_` provider variables; see [paid shop lookup testing](STAGING.md#paid-shop-lookup-testing).

Scraping Fish requests HTML with `render_js=true` so dynamically loaded product details can be included. It uses Fish's default rendering wait and the app's existing 35-second overall provider timeout. Rendering can increase import time. If the provider fails or times out, usable direct metadata is preserved; if no title is available, the user can still add the gift manually. Other generic integrations do not enable extra JavaScript rendering or premium proxy options. ScrapingBee retains its dedicated US Amazon product endpoint. Each paid attempt counts against the existing per-provider `PAID_DAILY_LIMIT`, even when it fails locally. The limit counts requests, not currency or provider credits. Provider-specific credit consumption and request-pack expiry are managed in the provider account.

References: [Scraping Fish](https://scrapingfish.com/docs/quickstart), [Fish JavaScript rendering](https://scrapingfish.com/docs/js-rendering), [Scrape.do](https://scrape.do/documentation/), [Scrapingdog](https://www.scrapingdog.com/documentation/).

## List dates and gift summaries

Lists have independent optional archive and reveal dates. Both take effect after the selected calendar day ends in the saved timezone, including daylight-saving changes. Archiving hides a list from active browsing and prevents new reservations and contributions. Existing purchase and contribution records remain available for reconciliation. The worker persists overdue archives; API reads and eligibility checks also enforce the schedule when the worker is offline. Restoring a list clears its archive schedule.

Set reveal dates and the optional exchange-giver reveal policy before first sharing. After sharing, the timezone and exchange policy are fixed, and an upcoming reveal date can only move later. Shared lists without a reveal date remain without a gift summary, including lists created before this feature. Removing all sharing groups or restoring an archive does not unlock these rules. After the reveal date passes it cannot change.

Owners and their existing profile guardians can open Gift summary after the reveal date, including on archived lists. It shows purchased gifts, buyers, and sent or received contributions. Sent contributions are marked as awaiting confirmation. Amounts, pool totals, discussions, outstanding pledges, and unpurchased reservations are excluded. Purchased exchange gifts appear only if the list's policy permits it. Ordinary surprise views stay unchanged, and Transparent lists retain their existing purchase visibility.

## Passkey labels

Add a passkey in Settings and choose a label such as `1Password` or `Work laptop`. Use Rename to change an existing label without registering another credential. Labels identify credentials inside Little Hint; they do not rename the password manager's vault item. Little Hint already supplies its service name and page title. Some password managers derive their item title from the site's parent domain instead, so rename that item in the password manager when needed. Existing passkeys and their domain binding are unchanged.

## Product cache and thumbnails

`PRODUCT_IMPORT_CACHE_ENABLED` defaults to `true` in both app and worker. Set it
to `false` and redeploy both services to bypass metadata caching. This setting
does not affect the existing public PWA cache, gift records, jobs, or images.
The gift form's **Refresh from shop** action bypasses cached retailer metadata
and enrichment for one attempt and still respects the configured daily limits.
Previously checked details retain their original timestamp; prices can change.

Migration 2 adds the disposable `product_import_cache` table and expiry index.
Deploy app and worker from the same build after normal backup and staging
validation. Older builds ignore the additional table and thumbnail files; no
existing data conversion is needed. For an operational cache reset, stop the
worker, run `TRUNCATE product_import_cache` against the intended installation,
then restart it. Removing these rows never removes gifts, jobs, or media.
Expired entries are ignored on reads and pruned on writes and hourly by the
worker. The cap is 1,000 entries of at most 64 KiB each, plus database overhead.

Versioned `*.webp.card-v1.webp` files live beside their full-size originals in
the uploads volume. They are covered by the existing volume backup. Thumbnails
can be regenerated by removing only these derived files while services are
stopped; keep every original `.webp`. The next authorized card request recreates
the rendition. No bulk thumbnail migration or startup conversion is required.

See [caching measurements](PERFORMANCE.md) for the repeatable synthetic benchmark
and the limits of the recorded results.

## Monthly service usage

Administration separates gift-suggestion searches, product-detail AI requests made by Get details, and paid shop lookup attempts by provider. The report is visible if any relevant service is enabled or current-month activity exists. Disabling a service does not hide its recorded activity. Periods use UTC.

Request totals include dispatched failures. Cached results and direct website lookups do not increment paid counters. A single Get details operation may use both a scraping provider and AI cleanup, so these counts are not counts of unique gifts. Suggestion web-search calls belong to discovery, not the paid scraping providers.

Product-detail AI token tracking starts with this release. Historical request counters remain visible, but missing token information cannot be backfilled. Returned tokens are recorded before validating generated content and attributed to the request's start month. Unknown model costs are unavailable, not zero. Estimates use the existing versioned model rates and cover only recorded usage; partial estimates and missing reports are explicitly labeled. Scraping credit prices depend on the provider plan and are not estimated. Reconcile actual charges in provider billing.

`GET /api/v1/admin/usage` returns the grouped report to administrators only. `GET /api/v1/admin/services` returns service configuration status without credentials or raw setup fields. It does not perform connection tests. The settings API reads and writes only family-group creation and automatic product photos. Deployment-setting writes are rejected; the discovery batch-save endpoint has been removed.

All SMTP, Telegram, Twilio, scraping, AI, and paid-request configuration comes from environment variables or built-in defaults. Saved database values for those settings are ignored. Recreate both app and worker after changing deployment configuration. Administration retains app preferences, usage, service status, and background jobs.

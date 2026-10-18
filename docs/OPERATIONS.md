# Operations and recovery

## Coolify deployment

Create a Little Hint project in your Coolify team and select its production environment. Connect your fork of `YOUR-ACCOUNT/little-hint` and the Compose build pack, with `/compose.yaml`. Set the app service domain to `https://littlehint.example.com:3000` in Coolify's Compose domain mapping. Port 3000 is internal; do not publish the database or worker. Coolify supplies HTTPS through its proxy. `APP_URL` must be `https://littlehint.example.com`, without the port.

Set runtime environment variables from `.env.production.example`. Generate a random database password and authentication secret, and a 32-byte base64 `SETTINGS_ENCRYPTION_KEY`. Keep these in Coolify's secret environment configuration and an independent password manager. Do not expose them as build arguments. App and worker use the same image. PostgreSQL 18 persists under `/var/lib/postgresql`; do not mount a PostgreSQL 17 data directory there. Major upgrades require dump/restore or a planned PostgreSQL upgrade.

The app applies versioned migrations before it starts. The worker waits for app health, then starts the durable pg-boss queues. `/api/health` checks database connectivity. App and worker health checks run inside their containers. For local Compose access only, add `-f compose.local.yaml` after `-f compose.yaml` to bind localhost port 3000 or `APP_PORT`.

Bootstrap the first administrator only after SMTP works, using the app container terminal:

```sh
node dist/server/cli.js bootstrap admin@example.com
```

This creates a 24-hour invitation; it does not email a code until the administrator signs in. The command refuses a second active bootstrap. Ordinary registration requires an invitation. Do not seed demo data in production.

## Email and optional providers

Any compatible SMTP provider can send application email. For Forward Email, use `smtp.forwardemail.net`, port 465 with TLS, and an alias on a domain with verified, approved outbound SMTP. For example, use `littlehint@example.com` as `SMTP_USER`, its generated alias password as `SMTP_PASS`, and `Little Hint <littlehint@example.com>` as `SMTP_FROM`. Replace these example addresses before deployment.

The app can run at `https://littlehint.example.com` while sending from `littlehint@example.com`. An existing verified sending domain can host the alias; adding the app's subdomain as a separate Forward Email domain is unnecessary. Optionally forward incoming mail for that alias to an inbox you monitor so replies reach you. DNS for the web app does not by itself configure email delivery. Keep provider credentials out of Git, chat, screenshots, and logs.

The initial SMTP settings must be available before email-code login. Later an administrator can manage integrations in Settings. Nonempty environment values override values entered in the UI; remove an environment override to use the UI value. UI secrets are encrypted using `SETTINGS_ENCRYPTION_KEY` and are never returned to the browser. Keep that key through restores.

Telegram requires a bot token and name. Account linking uses an expiring single-use code and explicit user action. Twilio requires account credentials, a sending number, and a Verify service. Configure signed status/inbound callbacks according to the routes in `src/server/app.ts`; verify a US number before enabling SMS preferences. OpenAI and ScrapingBee are optional. Paid integrations remain inactive without credentials. `PAID_DAILY_LIMIT` caps provider requests per UTC day, not dollars. Set provider-side budgets too.

## Existing backup sidecar

Backups use [Housewatch Digital backup-sidecar](https://github.com/Housewatch-Digital/backup-sidecar), release `0.3.0-postgres18`, source commit `d536ab480094e95ed38be90459f2d555cab3ed26`. Little Hint has no custom backup engine or scheduler. The PostgreSQL client major matches the server. The sidecar makes a logical database dump and backs up the uploads volume read-only. Never mount live PostgreSQL data as ordinary files. It has no Docker socket access.

Configure a separate Little Hint restic repository path, a new strong `RESTIC_PASSWORD`, and the storage provider's access credentials. The same storage account can host other applications, but Little Hint must have its own repository/prefix. Keep the repository password outside the backed-up server. Enable `COMPOSE_PROFILES=backup` only after these settings exist. The idle sidecar has a stale-backup health check; it is unhealthy until its first successful backup. If the registry requires authentication, configure access on the deployment server. The upstream source at the pinned release can also be built unchanged with Docker target `postgres`.

Create Coolify scheduled tasks targeting the backup container. Confirm the actual container name after deployment. Schedules use the deployment server's timezone.

| Task | Command | Schedule | Timeout |
|---|---|---|---|
| Nightly encrypted backup | `backup-sidecar run` | `0 3 * * *` | 3600 seconds |
| Weekly prune | `backup-sidecar prune` | `0 4 * * 0` | 3600 seconds |
| Monthly integrity check | `backup-sidecar check` | `0 5 1 * *` | 3600 seconds |

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

## Routine maintenance

Back up before migrations or dependency upgrades. Deploy app and worker from the same commit. Avoid changing `APP_URL` without also reviewing passkey relying-party IDs and allowed origins. Never delete Compose volumes as part of a redeploy. Keep the settings encryption key and restic password in an independent secure store. Treat restored data as private.

Logs deliberately omit gift content, buyer discussions, assignments, and secrets. Use operational job IDs and status codes to investigate failures. Rate limiting currently sees the proxy address; review limits before substantially increasing the number of simultaneous users. This app enforces privacy through server permissions, not end-to-end encryption from its operator.

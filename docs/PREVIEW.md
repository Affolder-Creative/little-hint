# Local and shared previews

From the repository root, run:

```sh
npm run preview
```

You need Node.js 24 or newer and a running Docker installation with Compose v2.30+
(or Compose v5). On macOS, Docker Desktop and OrbStack work. The first run needs
internet access to pull images and install dependencies inside the build container.
You do not need to run `npm install`, install PostgreSQL, Cloudflared, or OpenSSL,
or configure a `.env` file.

This builds the current checkout, including uncommitted changes, with the production
Dockerfile. The app and worker run with `NODE_ENV=production` and `APP_ENV=preview`.
There is no hot reload. Run the command again to rebuild using Docker's build cache.
Build output stays inside containers; your normal `dist/` and dependencies are untouched.
Startup exits successfully only after the app, worker, database, inbox, and gateway
are healthy and the app and inbox respond through the chosen origin. Containers
continue running when you close the terminal.

## Commands

| Command                          | Behavior                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run preview`                | Build and start with a loopback-only `http://localhost:<port>` URL. Close this preview's tunnel if one is running.                                    |
| `npm run preview -- --share`     | Build and start with a fresh public HTTPS URL. Close the previous sharing session first.                                                              |
| `npm run preview:status`         | Print the current URLs, accounts, build metadata, and container health; probe the canonical app route.                                                |
| `npm run preview:logs`           | Follow container logs. Ctrl-C stops following logs, leaving services running.                                                                         |
| `npm run preview:stop`           | Stop and remove this preview's containers, including its tunnel. Retain data and configuration. Safe to repeat.                                       |
| `npm run preview:reset`          | Show this checkout's identity and volumes, request confirmation, then delete its database, uploads, and captured mail and start fresh local fixtures. |
| `npm run preview:reset -- --yes` | Confirm that same reset for automation.                                                                                                               |

Docker allocates the gateway's available port automatically, bound only to
`127.0.0.1`. Use the URL printed by startup or status. A container recreation may
change the local port. The database, SMTP service, application, and worker have no
published ports and use an internal Docker network. Only the gateway and optional
tunnel join the network that can reach the internet.

## Sign in and try the scenarios

Use `alex@example.test` for the synthetic administrator or `sam@example.test` for
another family member. `jamie@example.test`, `riley@example.test`, and
`taylor@example.test` are also available. Enter the address, request an email code,
then open the printed inbox URL, `APP_URL/__preview/inbox/`, to read the message.
Return to the app and enter its six-digit code. No real email is sent.

The preview reuses `stagingFixtures()` and `addHouseholdScenario()`. It includes
family and friend groups, lists, gifts, reservations, purchases, exchanges,
contributions, group events, and the household sandbox. The signed-in app displays
a synthetic-preview banner. These accounts use the application's normal
email-code authentication and authorization.

The inbox intentionally has no separate password, so testers can retrieve codes
on the same device. Anyone who can reach a shared URL can read that inbox and sign
in as any synthetic account, including the administrator. Store only synthetic
data and share the link only with intended testers.

## Share with an iPhone or another device

```sh
npm run preview -- --share
```

Use the printed public URL on both your Mac and iPhone. The gateway, app cookies,
CSRF validation, passkey origin, and email links use that single canonical origin.
Opening the local gateway during a shared session redirects to the public origin.
Cloudflare provides a trusted HTTPS certificate. No certificate installation,
router setup, firewall change, Cloudflare account, or domain is needed.

Every `--share` invocation creates a new Quick Tunnel and random hostname. Previous
links stop working. A new origin may require signing in again; cookies, browser
storage, installed PWAs, passkeys, push permissions, and other origin-bound browser
features do not carry over. Database records and uploads still persist. Running
`npm run preview` closes sharing and restores the localhost origin.

Keep the Mac awake and Docker running while someone is testing. Quick Tunnels are
best-effort development services, not stable hosting. If the tunnel exits, run
`npm run preview -- --share` again for a fresh session. It deliberately does not
restart automatically and silently generate a hostname the app is not configured
for. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Persistence and isolation

The real checkout path determines a stable `little-hint-preview-<hash>` Compose
project and image tag. Separate worktrees have separate networks and named volumes.
Moving or copying a checkout changes its identity; do not copy its generated state
into another checkout. Stop the original checkout's preview before moving it.

Ignored `.local/preview/` contains:

- `state.json`: checkout identity, database password, authentication secret, and
  settings encryption key. Keep this with the data. Do not commit or share it.
- `compose.env` and `runtime.env`: generated configuration. The launcher explicitly
  supplies the Compose env file and uses a Docker-client-only environment allowlist.
  Normal `.env` files, shell provider credentials, `NODE_OPTIONS`, and Compose
  overrides are not loaded. `.dockerignore` excludes local configuration from builds.
- `tls/`: an internal SMTP CA and server certificate, generated by a pinned OpenSSL
  container. SMTP requires STARTTLS with certificate verification. Only Mailpit
  receives the server key; the application receives the public CA certificate.
  Startup renews certificates near expiry. These are unrelated to browser HTTPS.
- `gateway/Caddyfile`, `session.json`, and an operation lock while changing state.

The project has exactly three named data volumes: `<project>_database`,
`<project>_uploads`, and `<project>_mail`. Fixtures and the first-seed marker commit
in one database transaction. Subsequent startups migrate but skip seeding only when
the committed marker exists. An occupied unmarked database is refused, including
one containing only authentication records. `seed-preview` refuses reseeding;
`ensure-preview` is the launcher's idempotent entry point. Both require explicit
preview mode, production Node behavior, synthetic-data consent, and the dedicated
`little_hint_preview` database and role. The seeder also checks the connected
PostgreSQL database and role. Staging retains its separate guards and entry point.

If configuration is missing while volumes remain, startup refuses to generate new
secrets. Restore this checkout's original `.local/preview/state.json`, or use
`npm run preview:reset` to discard its data and create compatible configuration.
A damaged configuration has the same recovery options. Do not replace just the
authentication or encryption secret while preserving data.

## Integration limits

Email goes only to this preview's Mailpit, over verified internal SMTP TLS. Paid AI,
SMS, Telegram, scraping providers, external web push, and Cloudflare analytics are
disabled. Provider credentials in the shell or database are ignored; integration
settings cannot enable them in preview mode. Automatic product photos are off.
The internal app/worker network also prevents external fetches, so importing shop
pages may fail. Enter gift details and upload images manually to test those flows.

Unavailable integrations are not simulated successful deliveries. The normal app
may show unavailable actions or failed delivery/import attempts. Contributions and
purchases are application records, not real payments. Use staging or a separately
configured development environment for genuine external-provider acceptance tests.

## Troubleshooting and cleanup

- **Docker unavailable:** start Docker Desktop/OrbStack, check `docker info` and
  `docker compose version`, then retry. The launcher preserves Docker connection
  settings such as `DOCKER_HOST`, `DOCKER_CONTEXT`, and `DOCKER_CONFIG`.
- **Build failure:** inspect the build output. No runtime services change until the
  build succeeds. Builds have a 20-minute timeout. Retry after resolving the cause.
- **Unhealthy service or migration failure:** use status and logs. Startup prints
  recent service diagnostics, removes containers created by the failed attempt,
  and retains persistent data. Restore missing configuration or reset only when
  you intend to discard edits.
- **Port allocation failure:** Docker chooses an available loopback port. If Docker
  still reports a bind failure, retry startup; no fixed port needs freeing.
- **Tunnel discovery or HTTPS routing failure:** startup waits up to 90 seconds for
  a URL and up to two minutes for each public route. Check Docker's internet access
  and Cloudflare availability. Try local mode to continue development.
- **Wrong-origin/CSRF errors or old sign-in state:** use the current URL from status.
  A new hostname or localhost port is a new browser origin. Sign in again.
- **Another operation holds the lock:** wait for startup/reset/stop to finish.
  If the process crashed, inspect `.local/preview/operation.lock/owner.json`. Only
  after confirming that PID is no longer running, remove the lock directory and retry.
- **Interrupted startup:** normal termination cleans up newly created containers.
  A forced kill or Docker shutdown cannot complete cleanup. Restart Docker, then
  run `npm run preview:stop` followed by the desired start command.

Stop closes public access without deleting data. Reset removes only this checkout's
three recorded data volumes and reseeds locally. For complete removal, stop first,
then remove exactly those three volumes and the `<project>:app` image using the
identity printed by status, and remove `.local/preview/`. Do not use Docker prune
or broad container/volume filters. Other previews, worktrees, production, staging,
and unrelated containers are outside these commands' scope.

## Checks

`npm run test:preview` runs launcher unit tests and fake-Docker lifecycle tests.
`npm run test:compose` validates isolation and exposure in the Compose definitions.
Preview and staging seed integration tests exercise transaction rollback, empty
database guards, concurrent seeds, and unchanged staging behavior against separate
disposable databases.

`npm run test:preview-smoke` uses a temporary checkout and real containers. It checks
email-code sign-in through the gateway/Mailpit, authenticated data access, a real
write, uploads, worker readiness, stop/start persistence, HTTPS origin changes,
secure cookies, stale-origin rejection, and reset/reseed. It cleans up only its own
resources. CI runs this without a live public tunnel. Browser acceptance is separate:
start `--share` and exercise sign-in, navigation, a mutation, and the inbox in desktop
Chrome and mobile WebKit with normal certificate verification enabled.

For the repeatable browser acceptance script, maintainers with the repository's
Playwright dependencies and browsers installed can run
`node scripts/preview/browser.mjs <current-public-origin>`. It uses installed Chrome
and Playwright WebKit with an iPhone profile, leaves synthetic test lists behind,
and saves screenshots under ignored `.local/preview-acceptance/`. This emulates
mobile WebKit; it does not substitute for testing device-specific features on a
physical iPhone.

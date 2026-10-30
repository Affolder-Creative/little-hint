# Persistent staging

Use a separate deployment server for staging. Run one persistent stack with an app, worker, PostgreSQL 18 database, and Mailpit. Build images in GitHub Actions so compilation does not compete with the small staging server's runtime. Keep the production server, data, secrets, and deployment triggers separate.

The examples below are placeholders. Record real server names, domains, resource IDs, credentials, and deployed digests in your private operator record. Never copy production data or environment variables into staging.

For release promotion, use the [Coolify release upgrade procedure](COOLIFY_UPGRADES.md).
It deploys the public release digest to staging before production. The branch
build workflow below is for feature testing.

## 1. Build a selected branch

Merge the staging workflow into `main` before its first dispatch. GitHub requires a manually dispatched workflow to exist on the default branch. Feature branches must include the staging support introduced with this workflow.

1. Open Actions → **Staging image** → **Run workflow**.
2. Keep **Use workflow from** set to `main`. Enter the trusted repository branch or full commit SHA in **ref**.
3. Wait for the image job, then copy `LITTLE_HINT_STAGING_IMAGE=…@sha256:…` from its summary. Use the digest, not a moving tag, for deployment.
4. Record the resolved commit SHA and image digest. Check the selected commit's PR CI results before treating it as validated.

The workflow builds only `linux/amd64` on a standard Ubuntu runner, caches Docker layers, serializes staging builds, and times out after 30 minutes. It does not run automatically on pushes, rerun the release pipeline, update production tags, or call Coolify. For a private repository it consumes the owner's Actions allowance. Inspect actual run duration before estimating monthly use. Keep cache storage within the account's included allowance.

The separate `ghcr.io/affolder-creative/little-hint-staging` package starts private. Verify its visibility and configure read-only package access on the staging server through Coolify's registry settings. Never make a private image public to work around authentication.

## 2. Prepare the staging server

Check available memory, disk, Docker, and proxy status. The Compose limits total 1,280 MiB: app 512, worker 256, PostgreSQL 384, Mailpit 128. Leave room for the OS, proxy, and monitoring. These are runtime limits, not a guarantee that every workload fits. Validate imports and queue processing under load; resize the staging server if necessary instead of moving experiments onto production. No builds should run on the staging host.

Create SMTP certificates once on the staging host, using the checked-out script:

```sh
sudo sh scripts/staging-tls.sh /data/little-hint-staging/tls
```

The Coolify version used for the original staging setup rejected variable interpolation in bind-mount sources and dropped `read_only` from long-form bind mounts. The Compose file retains literal host paths under `/data/little-hint-staging/tls` and short volume syntax with `:ro` for compatibility. These are version-specific workarounds, not universal Compose restrictions. Create certificates there before loading the Compose file and verify read-only mounts in the generated configuration.

The script refuses to overwrite an existing directory. It generates a private CA and a `mailpit` server certificate valid for one year. Only public `ca.crt` is mounted into app and worker through `NODE_EXTRA_CA_CERTS`; only Mailpit receives its server private key. The private CA key stays on the host. Preserve ownership and permissions when transferring these files. Mailpit's pinned image runs as UID 0 with all Linux capabilities dropped. Its private key must belong to host root and stay mode 0600. Running the script with `sudo` sets that ownership. When transferring certificates, verify `mailpit.key` is owned by `root:root`; a mode-0600 key owned by another user is unreadable even to container root.

Schedule certificate maintenance with your normal operations process. Before expiry, generate a new certificate set in a new directory. Stop the staging stack, retain the previous directory under a dated name, and move the new directory to `/data/little-hint-staging/tls`. Recreate app, worker, and Mailpit together. Node loads additional CA certificates at process startup. Never disable certificate validation as a workaround.

## 3. Configure Coolify

Create a `staging` environment in the existing project and a new Git-based Compose application on the staging server. Use `main` as the configuration source and `/compose.staging.yaml` as its Compose location. Use normal Coolify-managed Compose mode, not Raw mode. This is a **standalone** file; do not combine it with production Compose files. Set **Custom build command** to `true` and leave the custom start command empty. Coolify otherwise runs Compose during its build phase without runtime-only variables, which fails on the required secrets. The `true` command skips that unnecessary phase; normal startup receives the runtime variables and pulls missing images. There are no `build` services. Disable automatic deployments and preview deployments on this resource.

Set the variables from `.env.staging.example` as Runtime-only. Use fresh secrets:

- `STAGING_POSTGRES_PASSWORD`: a random hex password, so it is safe in a PostgreSQL URL.
- `STAGING_AUTH_SECRET`: at least 32 random characters.
- `STAGING_ENCRYPTION_KEY`: 32 random bytes encoded as base64.
- `STAGING_MAILPIT_UI_AUTH`: `operator:` followed by a long random alphanumeric password, stored only in Coolify and your password manager.
- `STAGING_APP_URL`: the exact public HTTPS origin, with no path or internal port.
- `LITTLE_HINT_STAGING_IMAGE`: the digest reported by the staging image workflow, or the public release digest when verifying a release.

Map the app domain, for example `https://littlehint-staging.example.com:3000`, to service `app`. Map a separate HTTPS hostname, for example `https://littlehint-staging-mail.example.com:8025`, to `mailpit`. Create DNS pointing to the staging server and verify TLS. The port suffixes are internal routing targets, not public port numbers. Do not expose database port 5432 or SMTP port 1025.

Do not attach production or shared external volumes. Coolify must create distinct staging PostgreSQL, uploads, and mail volumes. Check their actual names in the rendered configuration and storage page before first deployment. Do not attach the stack to a production network.

Keep only you authorized to read Mailpit: its messages include sign-in codes for all synthetic accounts. The UI and API require the configured login. STARTTLS is required for internal SMTP; app and worker trust the staging CA. Mailpit has no relay or forwarding configured.

App and worker run with `NODE_ENV=production` and `APP_ENV=staging`. They require the dedicated `little_hint_staging` database and role. Staging settings force mail to `mailpit:1025`, disable Telegram and default to direct shop lookups, and reject integration edits. Stored credentials and unprefixed external provider environment variables are ignored. Direct product-page import remains available. AI, paid scraping, and SMS can be enabled with dedicated staging environment variables. See [SMS setup](SMS.md#staging-with-real-sms) for real staging texts, phone sign-in, consent, and quota testing. The signed-in app displays a staging banner using runtime metadata.

## 4. Seed synthetic scenarios

Once migrations and health checks pass, run this **once** in the staging app container terminal:

```sh
ALLOW_SYNTHETIC_DATA=1 node dist/server/cli.js seed-staging
```

Do not save `ALLOW_SYNTHETIC_DATA` as a persistent variable and do not add seeding to startup commands. The command checks the staging environment, database name, database role, and explicit opt-in before migrations or data writes. It refuses a database containing authentication or application records, allowing only the running worker's operational heartbeat. Authentication users and domain fixtures commit in one transaction; a failure rolls everything back. Concurrent attempts cannot both seed.

Sign in as `alex@example.test`, `sam@example.test`, `jamie@example.test`, `riley@example.test`, or `taylor@example.test`, retrieving the code from Mailpit. Alex is the administrator. There is no shared password or authentication bypass.

The dataset includes two overlapping groups, a member outside the family group, Surprise lists, a Transparent list, purchases, a contribution pool with pledged and received contributions, a drawn exchange, an event with an appointed leader, and an archived list with a revealed gift summary. IDs are generated afresh. No production data or credentials are imported.

Passkeys must be registered separately on the staging hostname. Production sessions and passkeys are not copied.

## 5. Daily testing and reset

For each feature, manually build its branch, update the staging image digest, and redeploy both app and worker together. The database, uploads, and captured mail persist. Inspect `/api/health`, worker health, and logs; then test the change with the appropriate synthetic accounts. Record the tested SHA before merging the feature through the normal production process.

Switching branches does not reverse migrations or record formats. For an incompatible branch or a clean start, stop the staging stack and create fresh staging volumes. Identify the exact volumes using this resource's storage configuration, retain the previous volumes until the reset is verified, and run migrations and the explicit seed command against the fresh database. Do not run `docker system prune --volumes`, delete volumes by broad name matching, or reset a production resource. If a new Coolify resource is used to allocate fresh volumes, give it only staging configuration and transfer the staging domains after stopping the old resource.

Do not automatically roll back an image after a schema or domain-format change. Older writers may not recognize newer records. Use a compatible image and preserved staging data, or reset synthetic data first.

Staging has no production backup sidecar or production backup repository. Its synthetic data is disposable. Capture a separate staging snapshot only when preserving a particular debugging scenario matters.

## Acceptance checks

- Verify HTTPS, app/database health, worker heartbeat, and correct image digest on both app and worker.
- Seed once; verify a second attempt refuses without altering records.
- Sign in through Mailpit, verify invitations and notices stay captured, and confirm unauthenticated Mailpit UI/API access fails.
- Test family-versus-friends visibility, Surprise privacy, Transparent purchases, contributions, exchange assignments, event lists, and the revealed summary.
- Upload an image, redeploy, and verify accounts, purchases, uploads, and mail persist.
- Exercise imports and background jobs while checking memory, disk, restarts, and OOM events. Check production independently without writing production test data.
- Verify private SMTP/database ports, distinct volumes/network, no production credentials, and no public PR deployments.

Repository checks include `npm run typecheck`, `npm test`, `npm run test:compose`, and `npm run test:tooling`. PostgreSQL seed tests use `npm run test:staging-integration` with `STAGING_TEST_DATABASE_URL` pointing to a **disposable local** database named `little_hint_staging` owned by `little_hint_staging`; the tests truncate its application/authentication tables. Never point them at a deployed environment.

## Cloudflare analytics review

To review the optional analytics CSP, set `CLOUDFLARE_WEB_ANALYTICS=true` as a
Runtime-only variable on the staging resource and redeploy app and worker.
It defaults to `false`; enable it only when reviewing analytics with synthetic
data. This allows Cloudflare's beacon and reporting hosts without enabling
inline scripts or unrelated hosts. Cloudflare must already inject the beacon
for live analytics to appear. See [operations](OPERATIONS.md#optional-cloudflare-web-analytics)
for verification and opt-out instructions. Production settings are independent.

## Automatic product photos

Administration → App settings → **Automatically import product photos** is
OFF by default, including on upgrades. The preference is shared by everyone on
that instance. Staging can edit it while all external provider restrictions stay
in force. Manual uploads and existing photos are unaffected.

`AUTO_IMPORT_PRODUCT_PHOTOS=true` or `false` overrides the saved preference and
locks its admin control. Leave it unset or empty to use the saved preference,
falling back to OFF. Only these exact values are accepted; invalid nonempty
values fail startup. The Compose definitions pass it to both app and worker.
Changing the environment requires redeploying both; changing the saved admin
preference needs no restart. Removing an override restores the saved preference.

Each import attempt reads the preference when it starts. Pending jobs use the
latest preference; an already-running import may still finish with a photo.
Completed previews stay usable. Enabling photos does not backfill old gifts.
With photos OFF, a usable title skips paid fallback even if the page has no photo.
Missing usable metadata can still use the configured paid provider in production.

For a staging rollout, build the reviewed feature commit with the **Staging
image** workflow on main and set its digest as `LITTLE_HINT_STAGING_IMAGE`.
Use the feature branch for the staging Compose source if its configuration has
changed. Deploy app and worker together. Test OFF → ON → OFF with a controlled
public product fixture, checking image requests, media records/files, manual
uploads, existing photos, and persistence after restart. Verify an environment
override locks both the UI and write API, then remove it to restore UI testing.
Use dedicated staging credentials only when testing real paid integrations; use mocked provider tests for routine paid-fallback checks. Leave staging OFF when testing finishes.

A rollback to code predating this preference restores automatic photo importing,
even if the environment says false. No migration or media deletion is part of
this change. Abandoned previews and manual uploads can still leave unused files;
a retention and cleanup policy is separate work.

## Paid AI testing

Create a separate service account key in the OpenAI project `Little Hint (Staging)`.
Set `STAGING_OPENAI_API_KEY` in the staging host's runtime secrets. Both app and
worker receive it from `compose.staging.yaml`. Ordinary `OPENAI_API_KEY` values
and saved database credentials remain ignored in staging.

Set `STAGING_PAID_DAILY_LIMIT=10` to permit up to ten product-detail AI requests
per day. To test gift suggestions, set `STAGING_GIFT_DISCOVERY_MODE=both`, with
`STAGING_GIFT_DISCOVERY_USER_WEEKLY_LIMIT=3` and
`STAGING_GIFT_DISCOVERY_MONTHLY_LIMIT=20`. Discovery has its own quotas, separate
from the daily product-detail request limit. These are request limits, not dollar
limits. Model overrides are `STAGING_OPENAI_MODEL` and
`STAGING_GIFT_DISCOVERY_MODEL`.

Recreate both app and worker after changing these variables. Remove the staging
key to disable all AI, or set discovery mode to `off` to disable suggestions only.
AI settings are configured on the server and are not exposed in Administration. Test with
synthetic accounts; requests incur charges in the staging OpenAI project.
Preview deployments still ignore all AI credentials, including staging keys.
Mailpit and messaging isolation remain unchanged. Paid scraping has its own opt-in below.

### Per-account AI allowances

`STAGING_GIFT_DISCOVERY_USER_OVERRIDES` accepts the same JSON format as production,
but use account IDs from the staging database. For example, in a hosting
runtime-value field:

```json
{
  "staging-account-id": {
    "weeklyLimit": "unlimited",
    "bypassMonthlyLimit": true
  }
}
```

Omit either property to retain its shared limit. A numeric `weeklyLimit` from
0 to 999999 is also supported. Recreate both app and worker after changes.
Staging ignores `GIFT_DISCOVERY_USER_OVERRIDES`; production ignores the staging
variable; preview ignores both. Invalid active overrides stop startup without
logging their values. Overrides do not enable AI without a staging key and an
enabled discovery mode. Exempt searches still incur OpenAI charges.

## Paid shop lookup testing

Set `STAGING_SCRAPING_PROVIDER=auto` and configure only the provider keys you use
in the staging host's runtime secrets:

| Provider      | Staging variable               |
| ------------- | ------------------------------ |
| Scraping Fish | `STAGING_SCRAPINGFISH_API_KEY` |
| ScrapingBee   | `STAGING_SCRAPINGBEE_API_KEY`  |
| Scrape.do     | `STAGING_SCRAPEDO_API_KEY`     |
| Scrapingdog   | `STAGING_SCRAPINGDOG_API_KEY`  |

Use dedicated staging credentials. Ordinary `SCRAPING_PROVIDER` and unprefixed
provider keys, along with saved database credentials, remain ignored in staging.
Both app and worker receive these variables from `compose.staging.yaml`.

The selector accepts `auto`, `none`, `scrapingfish`, `scrapingbee`, `scrapedo`,
or `scrapingdog`. Empty defaults to `auto`, which chooses the first configured
provider in this order: Fish, Bee, Scrape.do, Dog. It does not try another provider
if the selected one fails. An explicit selection without its staging key uses
direct lookup only. Set `none` or remove all staging scraping keys to disable
paid scraping without disabling AI.

Set `STAGING_PAID_DAILY_LIMIT=10` to allow paid requests. This setting applies
separately to each paid service, including product-detail AI. A value of `0`
disables paid requests; Compose defaults to `10`, while a runtime without this
variable defaults to `0`. Scraping does not require `STAGING_OPENAI_API_KEY`.
Direct HTML import runs first; a paid request is made only when required details
are missing. Requests incur charges with the selected provider.

Recreate both app and worker after changing these variables. With a configured
provider and a positive limit, Administration shows Shop lookups as Configured
with the provider name. Preview deployments ignore all scraping credentials,
including staging keys.

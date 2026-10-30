# Deployment checklist

For feature testing with synthetic data, use the [isolated staging setup](STAGING.md).

This repository contains reusable deployment instructions. Keep each installation's actual values and status in a private operator record, such as ignored `.local/deployment/DEPLOYMENT.md`, and in your password manager or deployment platform. Never commit that record or raw API responses.

## Public landing page

The project landing page at <https://littlehint.affoldercreative.com/> is published
from `marketing/` to GitHub Pages, with **Enforce HTTPS** enabled. In Cloudflare,
keep the `littlehint` CNAME pointing to `affolder-creative.github.io` with proxy
status **DNS only**, shown as a gray cloud. Leave it DNS-only after certificate issuance.
See [marketing deployment](MARKETING.md#github-pages-deployment) for setup and
verification. Self-hosted app installations have their own domains and HTTPS
configuration.

## First installation

This is an early 0.x release with support as time allows. You need a Linux host
with Docker Engine and the Compose plugin, a domain with HTTPS routing to the
app, and an SMTP account for sign-in codes. Node.js is not required on the host
for a container installation. You pay for your infrastructure and optional
providers; personal self-hosting has no Little Hint license fee. Read the
[license conditions](LICENSING.md) before offering it to others as a service.

Choose one installation path:

- **Release image:** use a completed [GitHub Release](https://github.com/Affolder-Creative/little-hint/releases)
  and follow [Deploying a release](RELEASING.md#deploying-a-release). Verify the
  download checksums. Private repositories and GHCR packages require access;
  repository visibility alone does not make a package public.
- **Build from source:** clone the repository, enter its directory, and check out
  the release tag you intend to install. Follow the separate build and startup commands
  in [operations](OPERATIONS.md#optional-source-build-installation). The build uses Docker and
  does not need your runtime secrets. Avoid tracking a moving development branch
  for an installation you rely on.

For either path:

1. Copy `.env.production.example` to `.env.production` and restrict access with
   `chmod 600 .env.production`. Generate separate random values for
   `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `SETTINGS_ENCRYPTION_KEY`.
   `openssl rand -hex 32` works for each of the first two values; use
   `openssl rand -base64 32` for the encryption key. Keep the encryption key
   with your backups; changing it makes saved provider credentials unreadable.
2. Fill in your exact HTTPS `APP_URL`, SMTP host/port/credentials, and sender.
   Set `COMPOSE_PROFILES=` for the initial startup, including when using an older
   release bundle that defaults to `backup`. Enable the optional backup sidecar
   only after configuring its repository credentials and image access. You can
   use another backup system; both PostgreSQL and uploaded files need protection.
3. Configure your HTTPS reverse proxy. `compose.production.yaml` exposes port 3000 only on
   the Docker network. A host-based proxy can use `compose.local.yaml`, which
   binds `127.0.0.1:${APP_PORT:-3000}`. Include the same Compose files in every
   startup, status, and bootstrap command. Do not publish the database port.
4. Start the stack and wait for healthy app, worker, and database services.
   Use `docker compose --env-file .env.production -f compose.production.yaml ps`,
   adding the local-port overlay if selected. Use the legacy files instead when
   following the optional source-build path. Investigate failed
   services before continuing; a healthy app alone does not verify email.
5. Run the documented bootstrap command with your own email address. It creates
   an administrator invitation valid for 24 hours. Open your `APP_URL`, request
   a sign-in code, and confirm it arrives through your SMTP provider. Complete
   sign-in and confirm you can access administration settings. Production has
   no local-mail fallback.
6. Add a test wish list and item. Recreate app and worker containers and confirm
   the account and item persist. Arrange off-host backups and complete a restore
   drill, then check the applicable [acceptance checks](VALIDATION.md#required-before-broad-production-use).
   Do not use `docker compose down --volumes` on an installation you want to keep.

## Coolify installation settings

Use prebuilt registry images for both environments. Follow
[Coolify release upgrades](COOLIFY_UPGRADES.md) for the existing production
resource and [persistent staging](STAGING.md) for staging certificates and mail.
Keep existing production database and uploads volume identities when transitioning.

- Connect the repository using the Compose build pack in normal managed mode.
- Use `/compose.production.yaml` for production or `/compose.staging.yaml` for staging. Each file is standalone.
- Set Custom Build Command to `true` and leave Custom Start Command empty.
- Set `LITTLE_HINT_IMAGE` or `LITTLE_HINT_STAGING_IMAGE` to a verified image digest; pin the configuration checkout to its reviewed commit.
- Keep application variables Runtime-only in production and preview settings; the image build requires no deployment secrets.
- Set production `APP_URL` or staging `STAGING_APP_URL` to your public HTTPS origin and route the app service's internal port 3000 through Coolify. Keep the database and worker private.
- Choose the first administrator's email. Bootstrap that account only after verifying SMTP delivery.
- Use a dedicated sender alias on an existing verified SMTP domain if available. The email domain and app hostname can differ.
- Store database, authentication, encryption, provider, and backup credentials as runtime secrets. Never include them in source or image build arguments.
- Keep automatic and preview deployments disabled. Promote releases manually after staging validation.

Optional server-side source builds still use `/compose.yaml` with the separate
[build command](OPERATIONS.md#optional-source-build-installation).

## Private operator record

Record the selected team, server, repository branch, app URL, administrator email, SMTP alias, Coolify project/environment/application IDs, and deployed revision in your private operator record. Preserve generated credentials separately in a password manager. Local ignored files are not a substitute for a secure off-host copy.

Track DNS/TLS verification, SMTP delivery, administrator bootstrap, backup activation and restore evidence, remaining device/provider checks, and deployment results privately. Do not publish raw API responses, provider settings, deployment tokens, or database exports.

## Activation

Follow [operations](OPERATIONS.md) for migrations, administrator bootstrap, providers, schedules, and recovery. Complete the applicable [release checks](VALIDATION.md). Healthy containers alone do not confirm working public HTTPS, email delivery, off-host backups, or device installation.

## Upgrading to group events

Take a database backup and stop both app and worker before replacing their images with this release. Start both from the same new build before creating any group events. There is no SQL migration; existing groups default to no appointed event leaders and existing lists keep their behavior.

Do not run a pre-event app or worker against a database containing group events. Its transaction writer does not recognize the new record kind and can delete event records. A rollback to a pre-event build requires restoring the pre-upgrade database backup as well; it loses changes made since that backup. Do not perform that rollback automatically.

After upgrading, confirm that a group owner can appoint an event leader, create an event with two selected people, and that each person can add a wish while an unselected group member can shop from those lists. Confirm the worker is healthy and Surprise recipients cannot see purchase activity.

### Deployment settings and app preferences

Configure email, Telegram, Twilio, scraping providers, AI credentials/models, gift-suggestion availability and allowances, and paid-request limits in the hosting environment. Empty values use built-in defaults, not saved database configuration. Recreate both app and worker containers after changes. Administration edits only family-group creation and automatic product photos, unless ENV overrides lock them. It also reports service configuration status, usage, and background jobs.


### Coolify environment checklist

For `compose.production.yaml`, keep application variables Runtime-only. The shared Compose configuration passes them to both app and worker. Existing deployment secrets must be retained, not regenerated for this change. This checklist describes repository requirements; it does not inspect the values saved in Coolify.

| Purpose | Variables to check | Requirement/default |
| --- | --- | --- |
| Deployment | `LITTLE_HINT_IMAGE`, `APP_URL` | Required release image digest and public HTTPS origin. |
| Existing secrets | `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY` | Required. Retain existing values. The settings key remains necessary for app preferences and must decode to 32 bytes from base64. |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` | Production email-code sign-in needs working SMTP. Port defaults to `465`; set a real authorized sender. User/password are required if your SMTP server requires authentication. |
| AI access | `OPENAI_API_KEY`, `OPENAI_MODEL` | Key required only for AI. Product-detail model defaults to `gpt-6-luna`. |
| Gift suggestions | `GIFT_DISCOVERY_MODE`, `GIFT_DISCOVERY_USER_WEEKLY_LIMIT`, `GIFT_DISCOVERY_MONTHLY_LIMIT`, `GIFT_DISCOVERY_MODEL` | Choose mode explicitly: `off`, `givers`, `receivers`, or `both`. Unset defaults are `givers`, `3`, `100`, and `gpt-6-luna`. The production example explicitly uses `off`. An OpenAI key is also required. |
| AI allowance exceptions | `GIFT_DISCOVERY_USER_OVERRIDES` | Optional JSON keyed by account ID. Empty means no exceptions. |
| Paid shop lookups | `SCRAPING_PROVIDER` and the corresponding `SCRAPINGFISH_API_KEY`, `SCRAPINGBEE_API_KEY`, `SCRAPEDO_API_KEY`, or `SCRAPINGDOG_API_KEY` | Only configure providers you use. Selection defaults to `auto`, preferring Fish, then Bee, Scrape.do, Dog. `none` disables paid scraping; direct shop lookup remains available. Staging uses dedicated `STAGING_` variables; see [paid shop lookup testing](STAGING.md#paid-shop-lookup-testing). |
| Daily paid-request cap | `PAID_DAILY_LIMIT` | Defaults to `50` per service per UTC day. Applies to product-detail AI and paid shop lookups, not gift-suggestion allowances. `0` blocks those paid requests. This is a request count, not a dollar budget. |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME` | Optional; both needed for Telegram setup. |
| Text messages | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_VERIFY_SERVICE_SID` | Optional; configure all four for verified SMS. |
| Browser push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional; a matching key pair and valid `mailto:` or HTTPS subject are needed. Keep the pair stable across deployments. |
| In-app preferences | `FAMILY_GROUP_CREATION`, `AUTO_IMPORT_PRODUCT_PHOTOS` | Leave empty/unset to keep the PWA controls editable. Explicit `everyone`/`admins` and `true`/`false` values lock the respective controls. |
| Other options | `PRODUCT_IMPORT_CACHE_ENABLED`, `CLOUDFLARE_WEB_ANALYTICS` | Defaults: `true`, `false`. These were already deployment settings. |

Compose supplies `DATABASE_URL`, `NODE_ENV`, `APP_ENV`, `PORT`, and `UPLOAD_DIR`; they do not need separate Coolify entries with this production file. `APP_PORT` belongs to optional port-publishing configurations, not this standalone file.

If you use the optional backup sidecar, retain `COMPOSE_PROFILES=backup`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, and credentials for your storage backend. S3-compatible storage uses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`; native B2 uses `B2_ACCOUNT_ID` and `B2_ACCOUNT_KEY`. The existing backup name, retention, and age defaults are listed in [.env.production.example](../.env.production.example). This change does not alter backup configuration.

After updating values and selecting an image containing this feature, recreate both app and worker. Check email sign-in, the worker, and Administration's service status. A “Configured” label confirms setup presence, not a successful delivery or connection test.

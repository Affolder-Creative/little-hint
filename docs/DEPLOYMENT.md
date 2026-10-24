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
  the release tag you intend to install. Run the container deployment commands
  in the [README](../README.md#container-deployment). The build uses Docker and
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
3. Configure your HTTPS reverse proxy. `compose.yaml` exposes port 3000 only on
   the Docker network. A host-based proxy can use `compose.local.yaml`, which
   binds `127.0.0.1:${APP_PORT:-3000}`. Include the same Compose files in every
   startup, status, and bootstrap command. Do not publish the database port.
4. Start the stack and wait for healthy app, worker, and database services.
   Use `docker compose --env-file .env.production -f compose.yaml ps`, adding
   the release and local-port overlays if you selected them. Investigate failed
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

- Create a Little Hint project in your chosen Coolify team and select its production environment. Add descriptions that identify the app's purpose.
- Connect your repository and select `main` or your intended release branch. Use the Compose build pack with `/compose.yaml`.
- Set Custom Build Command to `docker compose --env-file /dev/null -f compose.build.yaml build`. Leave Custom Start Command empty. Build and run on the same Docker host.
- Keep application variables Runtime-only in production and preview settings; the image build requires no deployment secrets.
- Set `APP_URL` to your public HTTPS origin and route the app service's internal port 3000 through Coolify. Keep the database and worker private.
- Choose the first administrator's email. Bootstrap that account only after verifying SMTP delivery.
- Use a dedicated sender alias on an existing verified SMTP domain if available. The email domain and app hostname can differ.
- Store database, authentication, encryption, provider, and backup credentials as runtime secrets. Never include them in source or image build arguments.
- Keep automatic deployment disabled until configuration and validation are accepted.

## Private operator record

Record the selected team, server, repository branch, app URL, administrator email, SMTP alias, Coolify project/environment/application IDs, and deployed revision in your private operator record. Preserve generated credentials separately in a password manager. Local ignored files are not a substitute for a secure off-host copy.

Track DNS/TLS verification, SMTP delivery, administrator bootstrap, backup activation and restore evidence, remaining device/provider checks, and deployment results privately. Do not publish raw API responses, provider settings, deployment tokens, or database exports.

## Activation

Follow [operations](OPERATIONS.md) for migrations, administrator bootstrap, providers, schedules, and recovery. Complete the applicable [release checks](VALIDATION.md). Healthy containers alone do not confirm working public HTTPS, email delivery, off-host backups, or device installation.

## Upgrading to group events

Take a database backup and stop both app and worker before replacing their images with this release. Start both from the same new build before creating any group events. There is no SQL migration; existing groups default to no appointed event leaders and existing lists keep their behavior.

Do not run a pre-event app or worker against a database containing group events. Its transaction writer does not recognize the new record kind and can delete event records. A rollback to a pre-event build requires restoring the pre-upgrade database backup as well; it loses changes made since that backup. Do not perform that rollback automatically.

After upgrading, confirm that a group owner can appoint an event leader, create an event with two selected people, and that each person can add a wish while an unselected group member can shop from those lists. Confirm the worker is healthy and Surprise recipients cannot see purchase activity.

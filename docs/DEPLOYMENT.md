# Deployment checklist

For feature testing with synthetic data, use the [isolated staging setup](STAGING.md).

This repository contains reusable deployment instructions. Keep each installation's actual values and status in a private operator record, such as ignored `.local/deployment/DEPLOYMENT.md`, and in your password manager or deployment platform. Never commit that record or raw API responses.

## Installation settings

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

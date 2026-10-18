# Deployment checklist

This repository contains reusable deployment instructions. Keep each installation's actual values and status in a private operator record, such as ignored `.local/deployment/DEPLOYMENT.md`, and in your password manager or deployment platform. Never commit that record or raw API responses.

## Installation settings

- Create a Little Hint project in your chosen Coolify team and select its production environment. Add descriptions that identify the app's purpose.
- Connect your repository and select the branch you intend to deploy. Use the Compose build pack with `/compose.yaml`.
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

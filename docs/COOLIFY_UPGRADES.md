# Coolify release upgrades

Publish once, verify the release in persistent staging, then deploy the same
image digest to production.
GitHub Actions publishes artifacts; Coolify deployments remain manual.

| Purpose                                                       | Image                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Published releases, including release verification in staging | `ghcr.io/affolder-creative/little-hint`                  |
| Feature-branch testing in staging                             | `ghcr.io/affolder-creative/little-hint-staging`, private |

Both resources use `https://github.com/Affolder-Creative/little-hint` as their
configuration source. Keep historical `ghcr.io/kaffolder7/little-hint` images
available for old release bundles. GitHub repository redirects do not redirect
GHCR pulls. See the [organization transfer checklist](ORGANIZATION_TRANSFER.md)
for package access and migration details.

## 1. Confirm the published release

Finish the [release sequence](RELEASING.md#release-sequence) first. Require a
successful Release workflow and a published GitHub Release, not a draft or a
partially uploaded image. Record its tag, exact source commit and multi-platform
image index digest in the private operator record.

Download `IMAGE.txt` and `SHA256SUMS` into a fresh directory. For example, on a
machine with GitHub CLI and GNU `sha256sum`, replacing the tag for each upgrade:

```sh
gh release download v0.3.0 --repo Affolder-Creative/little-hint \
  --pattern IMAGE.txt --pattern SHA256SUMS --dir release-v0.3.0
cd release-v0.3.0
sha256sum --check --ignore-missing SHA256SUMS
cat IMAGE.txt
```

Require `IMAGE.txt: OK`. Its first line is the digest-qualified image reference;
`version=` and `revision=` identify the version and source commit. Compare them
with the release tag and successful workflow commit. Verify the registry index
contains the host's platform, with both AMD64 and ARM64 published. Use this index
digest throughout promotion, not `latest` or a minor-version alias.

On **each deployment server**, pull the selected image into the Docker daemon
used by that Coolify resource. Replace `<INDEX_DIGEST>` before running:

```sh
docker pull ghcr.io/affolder-creative/little-hint@sha256:<INDEX_DIGEST>
docker image inspect ghcr.io/affolder-creative/little-hint@sha256:<INDEX_DIGEST> \
  --format '{{json .RepoDigests}} {{json .Config.Labels}}'
```

Check the repository digest and OCI labels `org.opencontainers.image.version`,
`org.opencontainers.image.revision`, and `org.opencontainers.image.source` against
the release. New releases use the organization repository as their source label.
Docker image IDs can differ between architectures and Docker storage backends;
use the release digest and labels to verify identity. Confirm anonymous access to
the public release package. Keep credentials for the private feature package
separate. Pulling on a laptop or the staging host does not prepare production.

## 2. Preserve configuration and recovery options

Before each environment's deployment:

- Save its current source commit, image digest, Compose location, custom commands,
  domain mappings, destination server, volume identities and runtime settings in
  a private operator record. Keep raw API responses and secrets out of Git.
- Read the release notes and Compose diff for database migrations, record-format
  changes and supporting images such as PostgreSQL or Mailpit. Plan incompatible
  upgrades explicitly. The absence of SQL migrations alone does not prove an old
  writer can safely use newer application records.
- Keep automatic and preview deployments disabled. Verify Coolify can fetch the
  organization repository, including GitHub App access if that resource uses an
  integration. Pin the configuration checkout to the exact release commit on
  `main`; selecting the branch alone permits later changes to enter the rollout.
- Preserve runtime-only secrets, domains, destination, networks and existing
  database/uploads volumes. Read settings again immediately before saving so an
  older snapshot does not overwrite another operator's changes. Read back saved
  settings, including after an API error, before retrying or deploying.

Before production, take a fresh PostgreSQL logical backup and an uploads archive
or equivalent backup snapshot. Coordinate writes if needed to keep database and
file contents consistent. Record checksums, test a restore in an isolated
throwaway database and directory, and verify representative records and uploaded
file hashes. Store a verified off-host copy in an approved private backup location.
Protect the original `SETTINGS_ENCRYPTION_KEY` separately with recovery secrets.
See [backup and restore](OPERATIONS.md#restore-procedure). Keep old images and
volumes until the upgrade is accepted. Never use `down --volumes` or prune volumes
as an upgrade step.

## 3. Deploy and verify staging

Use the existing isolated staging resource and its synthetic data:

1. Set the source repository to `Affolder-Creative/little-hint`, branch `main`, and
   commit pin to the verified release SHA. Keep Compose Location
   `/compose.staging.yaml`, Custom Build Command `true`, and Custom Start Command
   empty. This Compose file is standalone.
2. Set the non-preview, Runtime-only `LITTLE_HINT_STAGING_IMAGE` to the **public
   release digest** from `IMAGE.txt`. Release verification does not require a new
   build in the private staging package.
3. Retain `APP_ENV=staging`, dedicated database/role, staging secrets, Mailpit
   STARTTLS certificates and authentication, provider restrictions, and all
   staging volume/domain mappings. Do not copy production configuration or data.
4. Deploy the resource through Coolify so app and worker both use the selected
   image. Do not reseed an existing database. The [seed command](STAGING.md#4-seed-synthetic-scenarios)
   is only for a new empty staging stack.
5. Complete the verification below, then sign in as a synthetic account using a
   code captured by Mailpit. Confirm the staging banner and expected records,
   then sign out. Confirm unauthenticated Mailpit UI/API requests are denied and
   mail remains captured. Exercise the changed behavior with synthetic data.

Stop promotion if staging fails. Preserve its logs and configuration privately;
resolve the failure before changing production.

## 4. Promote the same digest to production

Use the existing production Coolify resource with `/compose.production.yaml`.
This standalone file pulls `LITTLE_HINT_IMAGE` directly for both app and worker.
It does not build or depend on the host-wide `little-hint:local` alias.

1. Confirm staging passed, production backups are verified, and the **same**
   release digest is accessible on the production Docker host.
2. Pin the configuration checkout to the release SHA containing this file. Set
   Compose Location to `/compose.production.yaml`, Custom Build Command to
   `true`, and leave Custom Start Command empty. Use normal Coolify-managed
   Compose mode, not Raw mode. Keep automatic and preview deployments disabled.
3. Set Runtime-only `LITTLE_HINT_IMAGE` to the verified release digest from
   `IMAGE.txt`. Keep `APP_URL` set to the exact public HTTPS origin, without the
   internal port. Preserve all existing secrets, integration settings, backup
   profile, domains, and destination.
4. Before deploying, compare the generated Compose configuration and storage
   mappings with the saved production record. Keep the **same existing resource**
   and its actual database/uploads volumes. The source retains project name
   `little-hint`, services `db`/`app`/`worker`, database and role `little_hint`,
   volume keys `postgres18`/`uploads`, and the PostgreSQL mount `/var/lib/postgresql`.
   These source names alone do not prove that Coolify retained its generated
   volume names. If either actual volume identity differs, stop and resolve the
   mapping before deploying. Do not create replacement volumes, seed, bootstrap
   existing users again, or run `down --volumes`.
5. Read back the saved settings, then deploy app and worker together through
   Coolify. Verify the running image, existing users and settings, health, and
   uploaded files using the checks below.

For the first transition from `/compose.yaml`, record the previous custom build
command and image identity before replacing them. The new settings remove the
manual pull-and-retag dependency; subsequent upgrades change the digest and
configuration commit together. Existing production users and configuration stay
in the current database. Database migrations still run before app startup.

The local-build files and `compose.yaml` plus `compose.ghcr.yaml` remain supported
for existing installations. Older release bundles without the standalone file
must use their included definitions. Do not combine the standalone production
file with either legacy production file or with staging.

## 5. Verify completion and retain rollback evidence

For each environment, require all of the following before marking it upgraded:

- Coolify reports a successful deployment. Both running app and worker resolve to
  the intended release image and OCI version/revision, not merely the expected
  container names or local alias. Inspect each container's image ID and then that
  image's labels and digest information on its own host.
- App, worker and database health checks pass. The worker heartbeat is fresh,
  restarts are stable, no OOM events occurred, and startup/runtime logs show no
  migration, database, SMTP or worker errors. Check Mailpit health in staging.
- The public HTTPS homepage and `/api/health` return HTTP 200 with valid TLS.
  Staging authentication and the release-specific acceptance checks pass.
- Database and uploads mounts retain their identities. Existing application
  records and uploaded files remain intact, allowing for expected migrations
  and normal activity. Runtime settings and domain mappings match the approved
  configuration.

Record the deployment identifier, tag, source SHA, digest, backup location and
verification results privately. Keep staging and production on the same verified
release until the next intentional staging test.

If rollback is needed, first assess database and record-format compatibility.
An image-only rollback does not reverse migrations. For a compatible rollback,
restore the prior source pin and image setting or, for a legacy deployment,
production tag command, then redeploy both app and worker. For incompatible data, stop writers and follow the
[restore procedure](OPERATIONS.md#restore-procedure) using a compatible database
and uploads backup. Restoring loses changes since the snapshot; reconcile them
before reopening access. Never roll back automatically after a format change.

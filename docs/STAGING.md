# Persistent staging

Use a separate deployment server for staging. Run one persistent stack with an app, worker, PostgreSQL 18 database, and Mailpit. Build images in GitHub Actions so compilation does not compete with the small staging server's runtime. Keep the production server, data, secrets, and deployment triggers separate.

The examples below are placeholders. Record real server names, domains, resource IDs, credentials, and deployed digests in your private operator record. Never copy production data or environment variables into staging.

## 1. Build a selected branch

Merge the staging workflow into `main` before its first dispatch. GitHub requires a manually dispatched workflow to exist on the default branch. Feature branches must include the staging support introduced with this workflow.

1. Open Actions → **Staging image** → **Run workflow**.
2. Keep **Use workflow from** set to `main`. Enter the trusted repository branch or full commit SHA in **ref**.
3. Wait for the image job, then copy `LITTLE_HINT_STAGING_IMAGE=…@sha256:…` from its summary. Use the digest, not a moving tag, for deployment.
4. Record the resolved commit SHA and image digest. Check the selected commit's PR CI results before treating it as validated.

The workflow builds only `linux/amd64` on a standard Ubuntu runner, caches Docker layers, serializes staging builds, and times out after 30 minutes. It does not run automatically on pushes, rerun the release pipeline, update production tags, or call Coolify. For a private repository it consumes the owner's Actions allowance. Inspect actual run duration before estimating monthly use. Keep cache storage within the account's included allowance.

The separate `ghcr.io/YOUR-ACCOUNT/little-hint-staging` package starts private. Verify its visibility and configure read-only package access on the staging server through Coolify's registry settings. Never make a private image public to work around authentication.

## 2. Prepare the staging server

Check available memory, disk, Docker, and proxy status. The Compose limits total 1,280 MiB: app 512, worker 256, PostgreSQL 384, Mailpit 128. Leave room for the OS, proxy, and monitoring. These are runtime limits, not a guarantee that every workload fits. Validate imports and queue processing under load; resize the staging server if necessary instead of moving experiments onto production. No builds should run on the staging host.

Create SMTP certificates once on the staging host, using the checked-out script:

```sh
sh scripts/staging-tls.sh /data/little-hint-staging/tls
```

The script refuses to overwrite an existing directory. It generates a private CA and a `mailpit` server certificate valid for one year. Only public `ca.crt` is mounted into app and worker through `NODE_EXTRA_CA_CERTS`; only Mailpit receives its server private key. The private CA key stays on the host. Preserve ownership and permissions when transferring these files. Mailpit's pinned image runs as root; its private key stays mode 0600.

Schedule certificate maintenance with your normal operations process. Before expiry, generate a new certificate set in a new directory, update `STAGING_TLS_DIR`, and recreate app, worker, and Mailpit together. Node loads additional CA certificates at process startup. Never disable certificate validation as a workaround.

## 3. Configure Coolify

Create a `staging` environment in the existing project and a new Git-based Compose application on the staging server. Use `main` as the configuration source and `/compose.staging.yaml` as its Compose location. This is a **standalone** file; do not combine it with production Compose files. Leave custom build and start commands empty. There are no `build` services. Disable automatic deployments and preview deployments on this resource.

Set the variables from `.env.staging.example` as Runtime-only. Use fresh secrets:

- `STAGING_POSTGRES_PASSWORD`: a random hex password, so it is safe in a PostgreSQL URL.
- `STAGING_AUTH_SECRET`: at least 32 random characters.
- `STAGING_ENCRYPTION_KEY`: 32 random bytes encoded as base64.
- `STAGING_MAILPIT_UI_AUTH`: `operator:` followed by a long random alphanumeric password, stored only in Coolify and your password manager.
- `STAGING_TLS_DIR`: the absolute directory created above on the staging server.
- `STAGING_APP_URL`: the exact public HTTPS origin, with no path or internal port.
- `LITTLE_HINT_STAGING_IMAGE`: the digest reported by the staging image workflow.

Map the app domain, for example `https://littlehint-staging.example.com:3000`, to service `app`. Map a separate HTTPS hostname, for example `https://littlehint-staging-mail.example.com:8025`, to `mailpit`. Create DNS pointing to the staging server and verify TLS. The port suffixes are internal routing targets, not public port numbers. Do not expose database port 5432 or SMTP port 1025.

Do not attach production or shared external volumes. Coolify must create distinct staging PostgreSQL, uploads, and mail volumes. Check their actual names in the rendered configuration and storage page before first deployment. Do not attach the stack to a production network.

Keep only you authorized to read Mailpit: its messages include sign-in codes for all synthetic accounts. The UI and API require the configured login. STARTTLS is required for internal SMTP; app and worker trust the staging CA. Mailpit has no relay or forwarding configured.

App and worker run with `NODE_ENV=production` and `APP_ENV=staging`. They require the dedicated `little_hint_staging` database and role. Staging settings force mail to `mailpit:1025`, disable paid providers/SMS/Telegram/AI, and reject integration edits. Stored or environment-supplied external provider credentials are ignored. Direct product-page import remains available. The signed-in app displays a staging banner using runtime metadata.

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

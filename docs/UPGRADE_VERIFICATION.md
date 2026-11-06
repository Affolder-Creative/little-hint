# Published-image upgrade verification

Run the repeatable local drill against a built candidate image:

```sh
docker build -t little-hint:upgrade-candidate .
LITTLE_HINT_IMAGE=little-hint:upgrade-candidate npm run test:upgrade
```

Requires Node.js 24+, Docker Engine and Compose. The baseline is the published
0.19.4 multi-platform digest pinned in `scripts/upgrade-check.mjs`. Docker selects
the native architecture. The baseline pull needs registry access. No provider
credentials or existing installation are required. The command does not build
the candidate automatically or accept a production database/volume target.

## What it verifies

The baseline image runs its own migrations and synthetic staging seeder against
an empty disposable database. App and worker run in production mode with isolated
storage, no exposed ports, an internal Docker network, and optional providers
disabled. The CLI seeder alone uses staging mode and its dedicated database/role.
No credentials from the operator's application environment are forwarded.

Five synthetic accounts exercise overlapping groups, lists, purchases,
contributions, drawn exchanges, and spending records. Test-only signed sessions
exercise authenticated API access without sending email. The recipient must not
see surprise reservations; the buyer must see them. The check compares the
selected authenticated views, complete core records and financial values,
verified email identities, a closed-account fingerprint, and upload bytes before
and after upgrading. Session creation is a fixture, not proof of real sign-in
email delivery or passkey usability.

After stopping old writers, the drill takes a PostgreSQL custom-format dump and
an uploads archive. It starts the candidate app and worker, repeats migration,
recreates both containers, checks persistence again, and performs a new gift
write through the API. A queued reference to a removed import must survive the
shutdown and be acknowledged by the new worker without external requests. This
checks durable queue consumption, not every provider's retry behavior.

Recovery restores that snapshot into a second, empty database and uploads
volume using the matching baseline image. It verifies the original records and
views, runs the real `invalidate-sessions` command while writers are stopped,
and confirms that old sessions are rejected, verification codes removed, and
invitations revoked while gift history, accounts, and files remain intact.

Each run creates unpredictable `little-hint-upgrade-*` Compose project names.
Normal success and failure paths remove only those projects and their volumes,
plus temporary backup files. An interrupted host or force-killed process may
leave those disposable resources behind; inspect the exact names printed by
that run before cleaning them. Never substitute an installation's project name.

## CI and limits

Both AMD64 and ARM64 container jobs run the drill after the existing Compose
smoke check. Full release CI also selects those jobs. Release image jobs repeat
it against the exact image selected for publication, including retries.
Ordinary PRs select container checks through the existing CI policy.

This is local logical backup and filesystem recovery with synthetic data. It
is not an off-host backup-sidecar drill or physical-device certification. It does
not reconcile real post-snapshot closures or access changes for an operator.
Those remain required in [release readiness](V1_READINESS.md). Raw database
comparison intentionally fails when a future release changes the selected
records; review and explicitly test the intended migration rather than broadly
normalizing differences or silently updating expectations.

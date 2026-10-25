# Family groups and households

## Accounts without a family group

People can use Little Hint for private wish lists without a family group or
household. To invite someone this way, open **Settings → Invitations**, choose
**Invite someone to Little Hint**, and enter their email address. Any signed-in
user can send these invitations. The recipient has seven days to sign in with
that address and verify their email code. Invitations are queued for email
delivery; pending invitations can be cancelled from the same Settings section.

Signing in uses the account invitation without sharing profiles or lists with
the sender. Home offers a private wish list as the first step. A group owner can
later invite the same account to one or more family groups through
**Settings → Family groups → Members & invitations**. Each group invitation
requires acceptance. Joining a group gives access to its shared lists but does
not share the new member's existing private lists automatically.

## Groups and household membership

Family groups own invitations, membership, shared-list access, and exchanges.
An account may own or join multiple family groups. Households are optional
records inside one family group. They organize people and supply exchange
exclusions; joining a household never grants access to a family group or list.

Each household has an ID and display name. Each membership links a person ID
to a household ID. Duplicate names are allowed, including within one group.
Selectors show member names and a short ID when names repeat. Renaming changes
only the display name. People, including managed profiles, can have any number
of memberships or none. Managed profiles are eligible in groups containing at
least one of their account controllers, using the existing profile rules.

Owners create, rename, and delete households and manage any eligible person's
memberships. Members choose households for themselves and profiles they control.
Every mutation validates permissions and group membership on the server.
Membership forms use the person's revision to reject stale concurrent edits.
Leaving a group removes links for profiles no longer eligible in that group;
other groups and profiles with another eligible controller retain their links.
Claiming a managed profile also reconciles eligibility.

An exchange with household exclusions enabled blocks a pair if the participants
share **any household ID in that exchange's family group**. Names are never
compared. Existing self, controller/guardian, explicit-pair and previous-draw
rules remain. Draw creation validates feasibility; drawing rechecks current
memberships. Completed assignments are stored unchanged when households change,
are renamed or deleted, or a member leaves. An impossible draw stays a draft
and tells the organizer to add participants, reduce recipients, or relax
household/pair exclusions. Controller exclusions always apply.

## Staging testing

Deploy the exact PR commit to the existing Shaggy staging resource. Keep automatic
production deployment disabled. The staging resource uses its own database,
uploads, captured email and provider restrictions.

After the ordinary synthetic accounts exist, run inside the **staging app**:

```sh
ALLOW_SYNTHETIC_DATA=1 node dist/server/cli.js seed-households
```

The command requires `APP_ENV=staging` and the staging database/role. It adds a
scenario using a fixed internal group ID, never name-based identity. A repeat
run does nothing; it does not reset edits or overwrite existing data. Do not
rerun `seed-staging` against an occupied database.

1. Sign in as `alex@example.test`, obtaining the code from staging Mailpit.
2. Open Settings → Family groups. Choose a family group, then **Households**.
   Two **Household sandbox** family groups
   have the same name; their displayed short IDs distinguish them.
3. The larger group has two **The Smiths** households. The first contains Alex,
   Sam and Avery; the second contains Jamie, Riley and Avery. **Weekend home**
   contains Alex and Jamie. Taylor has no household.
4. Sign in as `sam@example.test`. Choose households for Sam or the managed
   **Avery Smith (synthetic)** profile. Sam cannot edit others' memberships or
   create/rename/delete household records.
5. As Alex, rename one Smiths household. Its selected members stay attached.
   Delete it to remove only its memberships. The other Smiths household remains.
6. Create an exchange in the larger sandbox with all five adults and household
   exclusions enabled. Each has a synthetic Surprise list. Draw and inspect each
   giver's assignments while signed in as that giver. Avery is available for
   separate managed-profile scenarios; including a controlled child also applies
   the guardian exclusion.
7. Put all participants in one household and try a new draw: it must explain
   that exclusions are impossible. Disable household exclusions to allow a draw
   (self, guardian and explicit exclusions still apply).
8. Change memberships after a successful draw: existing assignments remain.
   Start a new exchange to test the new household choices.
9. Leave the group as Sam. Sam and exclusively controlled Avery lose its household
   links and shared-list access; the identically named other group is unaffected.

## Deployment, backup and rollback

This is a greenfield model change. There is no legacy field, compatibility layer,
or application migration framework. New record kinds use the existing JSONB
record store, so no database DDL is needed. Accounts, profiles, lists, photos,
invitations, family-group membership and completed exchanges are not rewritten.

Before any rollout, inspect the target database for nonempty former labels:

```sql
SELECT count(*) AS labels_to_review FROM app_record
WHERE kind = 'people' AND coalesce(data->>'household', '') <> '';
```

The Shaggy preflight on 2026-10-22 found **0 nonempty labels among 5 profiles**.
Therefore staging needs no backfill. Check production separately before a future
approved rollout. If labels do exist, stop to review a one-time data conversion:
exact strings within each family group preserve prior exclusions; spelling,
case and whitespace variants remain distinct. Never infer relationships across
groups, and have owners review same-name people who may be unrelated. Do not
silently discard labels or introduce permanent legacy behavior.

Before deployment, record the current commit, image digest, Coolify runtime
configuration and volume names. Save a PostgreSQL custom-format `pg_dump` and a
snapshot/archive of the uploads volume outside the containers. Keep backups
private. Verify the dump with `pg_restore --list`. For a coordinated restore,
stop both app and worker while taking the backup or use a provider snapshot
that keeps the database and uploads consistent.

Rollback requires stopping **both app and worker**, restoring the matching
pre-deployment database and uploads, restoring the previous Coolify source and
image digest, and then starting both services. Do not run old and new versions
against the same database: older versions of the generic record writer do not
recognize the new record kinds and can delete them on their next transaction.
A database restore also removes writes made after the backup; export anything
needed before restoring. Follow the [existing backup runbook](OPERATIONS.md) for session and
notification reconciliation. Never restore staging into production.

No merge or production rollout is authorized by this PR. Owners' household
choices are the only remaining configuration decisions; no automatic inference
of relationships is performed.

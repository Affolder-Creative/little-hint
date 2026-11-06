# Draft publication notes for 1.0.0

Status: unpublished copy for maintainer review. Use the text below only after
[acceptance](V1_READINESS.md) is complete and the 1.0.0 release workflow succeeds.
The current release number is controlled by Release Please, not this draft.
This draft is not automatically injected into the GitHub Release. Reconcile
it with the final changelog and any remaining limitations during version-PR review.
The publication workflow preserves reviewed notes above its generated
`<!-- little-hint-artifacts -->` section and replaces that download section on
retry. Do not manually replace image digests or generated download instructions.

## Little Hint 1.0.0

Little Hint's first major release brings together private gift coordination for
families and friends, documented support expectations, and verified upgrade and
recovery tooling. It remains self-hosted and invite-only.

The 0.x releases introduced the features included in this milestone:

- Wish lists, private gift ideas, reservations, contributions, and secret gift
  exchanges, with recipient privacy and managed profiles.
- Faster capture through shared links where supported, paste capture, editable
  imports, and drafts. iPhone share-sheet integration is not promised.
- Repeating an annual event with fresh dates and eligible participants, without
  carrying over purchases, reservations, contributions, or exchange assignments.
- Personal JSON and CSV exports, verified email changes, and account closure
  with responsibility handoff and anonymized shared history.

Since 0.19.4, the stabilization work adds published-image upgrade/recovery checks,
cross-feature regression coverage, clearer support and recovery instructions,
and fixes for account-dialog focus and scrolling at small sizes and enlarged
text. The full changelog lists the individual changes.

## Upgrading an existing installation

The automated upgrade baseline is 0.19.4. Older installations should follow the
intermediate release instructions rather than assume a direct upgrade is tested.
Back up the database and uploads together, retain recovery secrets separately,
and verify a restore. Stop old writers before migration and keep app and worker
on the same image digest.

A container-only rollback does not reverse migrations or changed records.
Personal JSON/CSV exports cannot restore an installation. Before reopening a
restored backup, invalidate sessions and reconcile closed accounts, changed
emails, revoked access, and gift commitments. Follow the support, installation,
and upgrade links in the generated download instructions for this release.

## Support and limits

Support is provided as time allows, with no response-time or uptime guarantee.
Fixes target the latest stable release; there is no LTS or backport commitment.
The 1.x policy covers documented deployment configuration and CLI commands.
Internal API routes and the database schema are not a supported extension API.

Personal drafts are the offline capability. Shared lists, reservations,
contributions, and purchases require a connection. Installation, share targets,
passkeys, push, and badges depend on the browser and platform. Shop imports are
best effort, and manual entry remains available. Gift spending records do not
move money; amounts are in USD.

The license remains PolyForm Perimeter 1.0.0. Little Hint is source-available,
with restrictions on competing products and services. You provide and pay for
hosting, email, and any optional providers. Publication does not deploy or
upgrade an existing installation.

Occasion reminders and the private buying checklist remain future work and are
not included in this release.

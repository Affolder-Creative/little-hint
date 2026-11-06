# Support and compatibility

Support scope and installation requirements below apply to published releases.
The 1.x compatibility commitments begin with the published 1.0.0 release. Check
[GitHub Releases](https://github.com/Affolder-Creative/little-hint/releases) for
available versions and the [readiness record](V1_READINESS.md) for candidate
acceptance. The presence of this policy does not certify an unreleased version.

## Support scope

Bug reports belong in GitHub Issues. Report vulnerabilities privately through
[Security](../SECURITY.md). Support is provided as time allows, without a
response-time or uptime guarantee. Fixes target the latest stable release.
There is no maintained 1.0 LTS branch or promise to backport fixes to older
releases. Operators should subscribe to releases and review upgrade notes.

Little Hint is source-available under PolyForm Perimeter 1.0.0. The 1.0 milestone
does not change the license, hosting costs, or responsibility for backups.

## Deployment and browser expectations

Published containers support Linux AMD64 and ARM64 with PostgreSQL 18. Run app
and worker from the same image digest. Container installations do not require
host Node.js; source development requires Node.js 24 or newer as specified in
package.json. Use the Compose definitions supplied with the selected release.

HTTPS and working SMTP are required for production sign-in. Providers for AI,
paid shop lookups, Telegram, SMS, and browser push are optional. Their presence
in Administration confirms configuration, not successful delivery. Operators
own provider credentials, billing limits, availability, and activation checks.

The acceptance target is current stable Chrome, Edge, Firefox, and Safari for
ordinary browser use, plus Safari on physical iPhone/iPad and Chrome on Android.
Record actual browser and OS versions in the release evidence before claiming
they have passed. Automated Chromium or WebKit coverage does not certify all
those browsers or replace physical-device and screen-reader checks.

| Capability                                 | Expectation                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Lists, gift coordination, account controls | Online browser workflows; verify the supported browser matrix before release.                                             |
| Installation                               | Depends on browser and OS; installation instructions and ordinary browser use remain available.                           |
| Share to Little Hint                       | Only where PWA share targets work. Paste capture is the general fallback; iPhone share-sheet integration is not promised. |
| Passkeys, push, badges                     | Depend on platform capability, installation state, configuration, and user permission. Email sign-in remains available.   |
| Offline use                                | Personal drafts only. Shared plans, reservations, contributions, and purchases require a connection.                      |
| Shop imports                               | Best effort, with editable results and manual entry. No guarantee of retailer availability or accurate current prices.    |

## Compatibility within 1.x

Documented deployment configuration and CLI commands are operator interfaces.
Compatible additions and fixes can ship in minor and patch releases. Removing
or incompatibly changing a supported interface requires a major release;
deprecations and required operator actions belong in release notes.

Account JSON exports identify `little-hint-personal-data` format version `1`.
Consumers should tolerate additional fields. Incompatible export changes must
use a new format version. CSV tables are human-readable spreadsheet exports,
not a database backup or a restore format. Personal exports omit other users'
private data and cannot restore a complete installation.

The app's internal `/api/v1` endpoints and database representation are not a
supported third-party API or extension mechanism. The path name does not create
that commitment. No new public API is introduced by 1.0.

## Upgrades and recovery

Back up the database and uploads together, retain recovery secrets separately,
and verify an off-host restore before relying on the installation. Follow
[Coolify upgrades](COOLIFY_UPGRADES.md) or the supplied Compose instructions.
Stop old writers before migration; do not mix old and new app/worker versions.

The initial automated upgrade baseline for 1.0 is 0.19.4. This is not a promise
that every older 0.x version can skip directly to 1.0. Follow intermediate
release instructions when upgrading an older installation.

An image rollback does not reverse migrations or application-record changes.
Use a compatible database/uploads snapshot when required, and account for lost
post-backup writes. Prefer a forward correction when new production data exists.
Before reopening a restored installation, invalidate sessions and reconcile
closed accounts, changed email addresses, revoked access, and gift commitments.
See the [restore procedure](OPERATIONS.md#restore-procedure).

Backups can retain data removed from the live application. Operators define and
communicate retention for backups and provider logs. Account closure does not
erase old backup snapshots, and a restore must not silently reactivate closed
accounts.

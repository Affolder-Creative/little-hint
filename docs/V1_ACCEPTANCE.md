# 1.0 candidate acceptance worksheet

Status: template only. No checks are certified by this document. Use it with the
[readiness gates](V1_READINESS.md#acceptance-record), [support targets](SUPPORT.md),
and [installation validation](VALIDATION.md#required-before-broad-production-use).

Keep the completed installation record privately, for example in ignored
`.local/deployment/v1-acceptance.md`. Commit only a sanitized summary of results.
Never include credentials, real account identities, domains, backup contents, or
recovery locations in public evidence. Use synthetic accounts and authorized
provider destinations.

## Identify the candidate

- Tester and date: Pending
- Full source commit SHA: Pending
- Image name and digest, architecture: Pending
- CI run and tested SHA: Pending
- Previous installed release and digest: Pending
- Staging start/end times, at least 24 hours: Pending
- Browser/OS/device versions: Pending
- Enabled providers and test destinations: record privately
- Backup/restore evidence location: record privately

For every gate, record **Passed**, **Failed**, **Pending**, or **Not applicable**
with a reason, plus the tested revision/digest, date, tester, and evidence link.
A disabled optional provider may be Not applicable. Missing hardware or a
skipped required test remains Pending. Record failures even after fixing them,
with the correction and retest evidence.

## Perform and record checks

| Gate | Check and expected result |
| --- | --- |
| Full CI and upgrade | Full manual CI passes on the selected commit, including database checks, all browser suites, both architectures, audits, licensing, and source bundles. The [0.19.4 upgrade/recovery drill](UPGRADE_VERIFICATION.md) preserves records, amounts, uploads, privacy, and authentication boundaries. |
| Off-host recovery | Restore the actual off-host database and uploads into separate storage. Verify hashes/records, recovery secrets, backup failure alerts, and stale-backup detection. Invalidate old sessions and reconcile account closures, changed emails, revoked access, and post-snapshot gift commitments before reopening. Follow [operations](OPERATIONS.md#restore-procedure). |
| Browser and device matrix | Record current stable Chrome, Edge, Firefox, and Safari. On physical iPhone, iPad, and Android, check browser and installed-app use: sign-in, authorized deep links, relaunch, session persistence, keyboard, landscape, and safe areas. Unsupported install/share/push capabilities retain the documented browser or paste fallback. |
| Accessibility | Use keyboard-only navigation and an actual screen reader. Check names and errors, logical focus, Escape/cancel, focus return, both themes, 200% text/zoom, and narrow reflow. Verify a code field and its label remain reachable with the on-screen keyboard open. |
| Capture and event repetition | Capture a shared or pasted shop link, survive sign-in, recover from a failed lookup, edit, and save once. Repeat an event with eligible participants and new dates. The new event must have no inherited purchases, reservations, contributions, or exchange assignments. |
| Account lifecycle | Export JSON and each CSV table; verify the viewer's privacy boundaries. Change email by verifying both addresses, then check old sessions are rejected and new sign-in works. Closure must require review, a code, and DELETE; cancellation must preserve the account. Outstanding duties/commitments must block closure until resolved; shared history remains anonymized after closure. |
| Gift privacy and coordination | With separate recipient and buyer accounts, reserve and purchase a gift, exercise shared contributions and managed-profile access, and verify recipient views/notifications do not disclose surprise activity. Complete an exchange and check assignment access. |
| SMTP and optional providers | Verify real code, invitation, email-change, and closure delivery plus failure/retry. For enabled Telegram, SMS, and push, test linking/consent, delivery and outages; test SMS STOP and configured budgets. Record disabled providers explicitly. Configuration status alone is not delivery evidence. |
| Retailer capture | Exercise the shops advertised by the candidate, including blocked, regional, and variant URLs. Confirm editable results and manual entry when lookup fails. Record limitations rather than claiming universal retailer support. |
| Offline, reconnect, and updates | Opt into personal drafts, disconnect, relaunch and reconnect. Shared coordination remains online-only and private API data does not become offline content. Trigger an update with an unfinished form and an in-flight purchase; it must wait for a safe action, preserve drafts, and avoid duplicate writes. |
| Staging observation | Observe at least 24 hours with synthetic accounts. Check app/worker health, persistent uploads, retries, scheduled work, and unresolved errors. Record the final combined interface review and any known limitations. |

## Approve publication separately

Record the maintainer's decision and evidence references in the readiness record.
If a candidate changes, compare revisions and rerun the affected checks. Do not
carry a pass forward without identifying what changed and why the evidence still
applies. The generated version PR and tagged commit need their own full CI.

Use the [publication sequence](V1_READINESS.md#publication-and-deployment).
Merging the version PR allows automatic publication after CI, so manual checks
must be complete beforehand. After publication, verify the public release image
digest in staging. Promote that same digest only with a fresh verified backup and
a separate deployment decision. Record authentication, privacy, upload, and
worker checks after deployment.

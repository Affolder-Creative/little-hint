# Account lifecycle controls

Settings → Device & drafts offers a full personal JSON download and separate CSV tables for wishes/ideas, buying history, and spending. Other buyers' private activity and sign-in credentials are excluded. CSV amounts use USD, blanks mean unknown, and refund rows retain positive amounts with an explicit type. CSV text is protected against spreadsheet formula interpretation. Photos are authenticated links; device-only drafts are not exported.

Settings → Sign-in & security offers email changes and account closure. Email changes require separate codes for both addresses, preserve the account ID, and sign out every device. Push notifications must be enabled again.

## Close an account

The initial Close account button opens a review. It does not delete data. After reviewing the consequences, the user requests a code sent to their verified email address. They must enter that code and type `DELETE` before the final action is enabled. Codes expire after ten minutes, are bound to the account and current session, and stop working after five incorrect attempts. Requesting another code replaces the previous one. All mutations also require the configured application origin.

Closure checks responsibilities both before sending the code and inside the final deletion transaction:

- The last administrator must hand off administration. A managed profile with only one guardian must also be handed off. Choose a trusted connected member, then have that person review and accept the request under Sign-in & security. Requests expire after 24 hours and can be declined or cancelled. Acceptance transfers the responsibility; it does not close either account.
- Shared family-group ownership uses the existing ownership transfer and acceptance flow. A group containing only the closing account is removed.
- Active exchanges must be resolved with their organizer before closure. Archived or cancelled exchanges can remain as anonymous history.
- Unpurchased reservations and pledged or sent contributions must be resolved first. Closure never automatically cancels a commitment. Open activity on a wish or idea being removed also blocks closure, without revealing other buyers' private details.

Private ideas, solely owned wish lists, server drafts, preferences, discovery jobs, private spending records, credentials, invitations, authentication challenges, and notification destinations are removed. Joint lists retain their remaining owners. Shared settled reservations and contributions retain quantities and amounts with an anonymous user ID. Closed profiles display Former member. Authored discussion text is removed and structured mentions are anonymized. Other people's records and shared free text may still contain text they entered.

Spending connections end; other members retain their own records. Uploads become inaccessible immediately and are marked for the existing worker cleanup, including thumbnails. A retry after a filesystem failure keeps the tombstone so cleanup can resume. Browser drafts and cached product photos are cleared on the closing device. Other devices lose server access and clear their account caches through the existing session/access refresh behavior when they reconnect. Installation backups and mail/provider logs follow the operator's retention policy.

## Deployment and transaction guarantees

This change introduces schema version 4 and the `closed_account` table. It stores only SHA-256 fingerprints of closed account IDs. These prevent delayed authenticated requests and background jobs from recreating records for a deleted account, without retaining the original account ID, email, or name in that table. Domain data changes, the fingerprint, verification consumption, and auth deletion commit in one PostgreSQL transaction under the domain write lock. Sessions, passkeys, and linked auth accounts cascade from the deleted auth user.

Upgrade app and worker together. The app runs the migration before becoming healthy; the worker waits for app health. Older guarded binaries reject schema version 4. Rolling back requires stopping both services and restoring a matching pre-upgrade database and uploads backup, rather than running old binaries against the migrated database. A restored backup can also restore accounts closed after that backup; operators must account for those closures before reopening access.

Regression coverage includes domain handoffs and privacy, PostgreSQL rollback/concurrency and late writes, invalid/expired/reused codes, session binding and credential cascades, upload cleanup, and browser confirmation/cancellation at phone and desktop widths.

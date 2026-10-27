# Notifications

Little Hint keeps a signed-in notification history with independent read state. Email, Telegram, SMS, and browser push are optional delivery channels. Disabling a channel does not remove inbox entries. Existing channel/topic choices are preserved; new mention and wishlist topics do not silently enable email, Telegram, or SMS. Push starts only after enabling a device.

## Browser push setup

1. Run `npx web-push generate-vapid-keys` in a private terminal once.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on both app and worker. Use a real `mailto:` operator contact or HTTPS contact URL for the subject. Docker Compose passes these settings to both processes.
3. Keep that key pair across restarts and backups. Rotating it requires users to disable and re-enable their browser subscriptions. The private key must never be exposed in browser responses or committed to source control.
4. Serve the app over HTTPS with the correct `APP_URL`. Allow outbound public HTTPS access to browser push services. No inbound webhook is needed.
5. Open Settings → Notifications, enable push on the device, and send a test. Permission is never requested automatically.

On iPhone and iPad, add Little Hint to the Home Screen and launch it there before enabling push. Browser/device notification permissions and Focus settings control presentation. Permission denial does not disable the inbox. Staging and automated test environments never send real pushes, even if VAPID variables are present.

Each subscription belongs to an account and sign-in session. Sign-out, session expiry, and remote session revocation prevent subsequent delivery. Account switching clears the local binding, displayed notifications, and badge. A device can also be disabled from notification settings. A notification already accepted by a browser push service cannot be recalled. Previews default to generic. A user may enable names, list names, and priorities for wish-list additions separately for each channel. The setting explains lock-screen visibility and that delivered previews cannot be recalled. Stale account bindings are ignored.

## Delivery behavior

Mentions, relevant private notes, contribution status changes, invitations, exchange updates, and access changes default to push after device opt-in. Reservation and purchase updates default to the inbox unless their push topics are enabled. Cost-sharing messages describe recorded pledges and manually marked sent/received states; Little Hint does not transfer money.

Following is private and never changes access. Follow a family group for lists shared with it, a household for member-owned lists shared with that household's family group, a person for their accessible current and future lists, or one list. Managed and joint owners participate. Duplicate group/household names use IDs, never name matching. Overlapping follows produce one inbox entry.

Account wish-list channel choices are defaults. Custom follow channels resolve from list to person to household to group, then account defaults. Explicit custom settings at the same level combine their channels. Empty custom channels mean inbox only. Global channel switches, SMS consent/verification, Telegram linking, and active push devices remain required. Disabling a default topic does not override a custom choice; disabling the delivery channel does.

Mute a list to stop new inbox entries and queued external alerts regardless of broader follows. Existing authorized inbox history remains. Stopping an individual follow still permits updates from other follows. Resetting its custom channels uses inherited choices; removing a mute restores other applicable follows.

New items reach the inbox immediately. Push, email, SMS, and Telegram batch additions to the same list for 15 minutes from the first addition, with independent batches for each recipient/list. Later additions never extend the window. For example, additions at 12:00, 12:06, and 12:11 produce a summary at about 12:15. The worker checks due batches every ten seconds; provider delays can add latency.

Read, inaccessible, deleted, archived, muted, and unfollowed items are excluded immediately before each destination attempt. Summaries count only eligible additions. Channels are captured at creation and intersected with current preferences before sending, so newly enabled channels do not backfill earlier events. Devices only receive additions created after their activation. Private notification types keep their existing timing.

Detailed wish-list previews share bounded templates across channels and omit item titles, images, prices, buying plans, and private notes. Priority is captured at addition; later priority edits neither change the historical wording nor emit alerts. Managed/shared lists and mixed-actor batches use list-focused wording instead of claiming a recipient acted. Email subjects, preheaders, and bodies obey the email preview preference. Generic previews remain the default. A summary opens an authenticated batch route, marks its currently accessible entries read, and opens the list. Another account or a batch with no accessible entries receives the unavailable-update response.

Watching a discussion is automatic for authors, buyers, and contributors unless they explicitly stop watching. Explicit mentions remain a separate topic. A private note's mention picker excludes recipients and their profile managers. Secret-exchange notes retain their narrower giver/manager audience. Typed names only notify someone when selected from the picker. Mentions and normal discussion delivery deduplicate for the same note and recipient.

Unread counts include only currently authorized inbox entries. Counts update while the app is open and when a push arrives. A badge on another closed device can remain stale until its next push or opening. Push must display a notification; silent pushes are not used to synchronize badges. The service worker caches static assets only and stores only an opaque device binding and badge timestamp in IndexedDB.

## Recovery and verification

Wish-list batches keep independent email, Telegram, SMS, and per-device push receipts. Failures retry up to five attempts with exponential backoff; administrator retries keep successful receipts. Confirmed SMS delivery failures require administrator retry. Legacy push retries transient failures up to five attempts per device with exponential backoff. Successful devices are not resent during ordinary retries. HTTP 404/410 subscriptions are removed. The existing worker heartbeat reports worker health. Administrator job status includes failed push deliveries and supports retry. Browser delivery is at-least-once: a worker crash after provider acceptance can duplicate delivery; stable notification tags replace the corresponding displayed notification when supported.

Deploy the app and worker from the same image. Stop the old worker before upgrading the app, then start the matching worker. Do not run old and new versions concurrently: older versions do not preserve record kinds they do not recognize. Keep a pre-upgrade database backup for rollback. New record kinds are additive in `app_record`; no separate service or SQL migration is required. New wish-list events use the additive `notificationBatches` record kind and an exclusive `wishlist-notification` job. Legacy notices without a batch reference finish through their original delivery paths with generic previews, subject to current access and mutes. Historical outbox entries are not backfilled into the inbox. Older service workers ignore the new preview and batch fields and safely open the generic inbox until updated. The existing PWA update prompt installs the updated service worker.

Run unit tests, PostgreSQL integration tests, the notifications and PWA browser suites, and the service-worker tooling tests before release. Real push acceptance and app icon badges also require a manual smoke test on installed iOS/iPadOS and supported Android/desktop browsers. Automated browser mocks cannot prove delivery through real browser push providers.

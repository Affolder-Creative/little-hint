# Notifications

Little Hint keeps a signed-in notification history with independent read state. Email, Telegram, SMS, and browser push are optional delivery channels. Disabling a channel does not remove inbox entries. Existing channel/topic choices are preserved; new mention and wishlist topics do not silently enable email, Telegram, or SMS. Push starts only after enabling a device.

## Browser push setup

1. Run `npx web-push generate-vapid-keys` in a private terminal once.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on both app and worker. Use a real `mailto:` operator contact or HTTPS contact URL for the subject. Docker Compose passes these settings to both processes.
3. Keep that key pair across restarts and backups. Rotating it requires users to disable and re-enable their browser subscriptions. The private key must never be exposed in browser responses or committed to source control.
4. Serve the app over HTTPS with the correct `APP_URL`. Allow outbound public HTTPS access to browser push services. No inbound webhook is needed.
5. Open Settings → Notifications, enable push on the device, and send a test. Permission is never requested automatically.

On iPhone and iPad, add Little Hint to the Home Screen and launch it there before enabling push. Browser/device notification permissions and Focus settings control presentation. Permission denial does not disable the inbox. Staging and automated test environments never send real pushes, even if VAPID variables are present.

Each subscription belongs to an account and sign-in session. Sign-out, session expiry, and remote session revocation prevent subsequent delivery. Account switching clears the local binding, displayed notifications, and badge. A device can also be disabled from notification settings. A notification already accepted by a browser push service cannot be recalled, so its preview is always generic and stale account bindings are ignored.

## Delivery behavior

Mentions, relevant private notes, contribution status changes, invitations, exchange updates, and access changes default to push after device opt-in. Reservation and purchase updates default to the inbox unless their push topics are enabled. Cost-sharing messages describe recorded pledges and manually marked sent/received states; Little Hint does not transfer money.

Following is private and never changes access. A person follow includes accessible current and future wishlists. Overlapping follows produce one entry. New items reach the inbox immediately; push batches additions to the same list for 15 minutes from the first addition. Read, inaccessible, archived, and unfollowed items are excluded before delivery. Re-enabling a device does not backfill old notifications.

Watching a discussion is automatic for authors, buyers, and contributors unless they explicitly stop watching. Explicit mentions remain a separate topic. A private note's mention picker excludes recipients and their profile managers. Secret-exchange notes retain their narrower giver/manager audience. Typed names only notify someone when selected from the picker. Mentions and normal discussion delivery deduplicate for the same note and recipient.

Unread counts include only currently authorized inbox entries. Counts update while the app is open and when a push arrives. A badge on another closed device can remain stale until its next push or opening. Push must display a notification; silent pushes are not used to synchronize badges. The service worker caches static assets only and stores only an opaque device binding and badge timestamp in IndexedDB.

## Recovery and verification

Push retries transient failures up to five attempts per device with exponential backoff. Successful devices are not resent during ordinary retries. HTTP 404/410 subscriptions are removed. The existing worker heartbeat reports worker health. Administrator job status includes failed push deliveries and supports retry. Browser delivery is at-least-once: a worker crash after provider acceptance can duplicate delivery; stable notification tags replace the corresponding displayed notification when supported.

Deploy the app and worker from the same image. Stop the old worker before upgrading the app, then start the matching worker. Do not run old and new versions concurrently: older versions do not preserve record kinds they do not recognize. Keep a pre-upgrade database backup for rollback. New record kinds are additive in `app_record`; no separate service or SQL migration is required. Historical outbox entries are not backfilled into the inbox. The existing PWA update prompt installs the updated service worker.

Run unit tests, PostgreSQL integration tests, the notifications and PWA browser suites, and the service-worker tooling tests before release. Real push acceptance and app icon badges also require a manual smoke test on installed iOS/iPadOS and supported Android/desktop browsers. Automated browser mocks cannot prove delivery through real browser push providers.

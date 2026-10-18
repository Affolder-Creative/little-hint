# Architecture

## Runtime boundary

One TypeScript codebase produces a static React/Vite application and Fastify/worker/CLI entrypoints. Fastify serves the frontend and `/api/v1` on the same origin; Better Auth uses `/api/auth`. React Router handles deep links; TanStack Query keeps authorized state in memory. All writes require an exact configured Origin and authenticated session, except signed provider webhooks.

The browser receives `/api/v1/world`, an authorization-filtered snapshot for this small private installation. It never receives the complete database state. Mutations use resource endpoints listed in `src/server/app.ts`, UUID idempotency keys, and record revisions where edits can conflict. The app re-fetches after writes. Uploaded and imported images remain authenticated API resources.

## Storage and transaction choice

Better Auth uses normalized PostgreSQL tables with foreign keys. Application records use a typed `app_record(kind, id, data jsonb)` table accessed through Drizzle. Each domain transaction takes a PostgreSQL advisory transaction lock, reads records, applies the domain command, and persists changed records atomically. The worker takes the same lock for its updates. Read-only projections see a committed snapshot.

This deliberately serializes domain writes across app and worker. It prevents last-unit reservation races, concurrent exchange draws, idempotency collisions, and access changes racing with reservations without adding Redis or another service. It suits a private family/friends deployment. It is **not** a high-volume multi-tenant design: memory and authorization scan costs grow with all records, and there is one domain writer at a time. If usage outgrows this, normalize high-volume entities, add foreign keys/indexes, paginate projections, and retain transactional allocation tests before changing lock granularity.

Application relations are currently enforced in domain commands rather than SQL foreign keys. Operator-written SQL can violate those relations; take a backup and use the CLI/domain operations. Versioned schema migration runs under a separate advisory lock. Dates in JSON records use ISO UTC; money is integer USD cents.

## Permission model

A recipient profile has an optional account and zero or more guardians. Anyone controlling any recipient of an item is a recipient for privacy decisions. Lists belong to recipient profiles, with pending joint owners until explicit acceptance. Selected group membership grants access to a shared list without duplicating items.

`itemVisible`, `recipient`, `giftView`, and `noticeAllowed` are the policy boundary. A Surprise recipient's DTO does not contain reservation fields, private comments, counts, or timestamps. Changing a reservation does not bump the public item's revision. Transparent views expose ordinary buyer identity/timing, but never pools or private discussion. Independent ideas always use surprise purchasing. Duplicate detection searches only visible items.

Buyer projections share coordination across the item's selected groups. Exchange reservations expose occupied quantity but hide the giver, purchase progress, and timestamps from other buyers. Exchange notes are restricted to the giver's controllers. Organizers see delivery status without assignments. Personal contribution history remains available to its payer/purchaser after access loss; it grants no renewed access to a removed group's gifts.

Access loss releases unpurchased units, retains purchased quantities, anonymizes shared former-buyer identity, cancels unfulfilled pledges on the lost buyer's reservation, and preserves sent/received financial records. Archives retain records and allow existing purchase correction/release. Lists lock mode after sharing, even if unshared later.

## Authentication and session safety

Better Auth handles email OTP and passkeys. Registration hooks require an active email-bound invitation. First administrator bootstrap creates a 24-hour grant and refuses a second bootstrap. OTPs expire after ten minutes and are stored hashed with attempt limits. Known accounts can continue signing in after leaving a group, but lose the group's access.

The deployment secret signs authentication data. HTTPS selects secure cookies. Same-origin requests and strict Origin checks protect mutations; auth retains its own CSRF/rate protections. Passkey relying-party name is Little Hint, ID is the configured hostname. Session revocation is available in Settings. A restore CLI revokes sessions, verification codes, invitations, and pending profile/ownership/Telegram links.

## Jobs and providers

PostgreSQL stores both an application outbox and pg-boss jobs. The worker dispatches pending notices/imports with exclusive singleton keys, so app restarts do not lose queued work. Jobs have timeouts/retries; completed application records suppress duplicate effects. Notice delivery records completed channels and rechecks access/preferences before each retry/channel. Exactly-once external delivery is not possible across a provider success and a process crash before acknowledgement; a generic notification may repeat in that narrow window.

Import failures become editable manual-entry states. An import that dies mid-flight is picked up from the durable running record. Expensive provider calls have UTC daily request caps; they are request counts, not dollar guarantees. Admin entered integration values use AES-256-GCM with random IVs. Nonempty ENV values override encrypted UI values; empty ENV entries are treated as unset. Browser responses include configuration source/presence only, never decrypted values.

Email uses SMTP/TLS with the approved PNG logo and text fallback. Telegram links expire and are single-use; polling checkpoints reside in PostgreSQL. US numbers are parsed and verified with Twilio Verify before SMS opt-in. Signed inbound STOP/status callbacks update preferences/delivery failure state. Integration logs contain generic codes, not secrets or message contents.

## Import trust boundary

HTTP(S) only, no credentials/unusual ports, no local/private/link-local IP ranges. Validate every redirect and DNS lookup at connection time to resist rebinding. Bound download bytes and image pixels; re-encode accepted images to WebP. Metadata is parsed as data and rendered as text. No imported HTML or executable URLs enter the UI. Amazon has selector and structured ScrapingBee adapters; other shops use Product JSON-LD/Open Graph and generic fallback. CAPTCHA/access-denied pages become manual entry.

Optional OpenAI uses Responses structured output with no tools, `store:false`, limited fields and an evidence-only instruction. It receives product title/description, not account/group data. Provider requests necessarily disclose the product URL/content being imported to that configured provider. Manual entry and deterministic tags work without AI or paid scraping. Real retailer pages can change or block requests; fixture coverage is not a live availability guarantee.

## PWA, drafts, and updates

The generated service worker caches only an explicit list of public shell/branding assets. It does not intercept `/api/` responses. Navigation falls back to the public shell offline. Private state lives in React Query memory, not IndexedDB/cache storage. Local draft opt-in stores title/URL/notes under the current account ID; sign-out clears personal draft keys. Publishing requires an authenticated form review. No offline reservation queue exists.

Installation uses capability detection with native prompts only after a tap, browser/Apple/embedded guidance otherwise. Reminders are browser-local, suppressed for 30 days/indefinitely or when standalone. The app does not claim installation after an instruction dismissal. Updates wait for an explicit click and reject activation during open/dirty forms or pending writes. Initial service-worker activation does not reload the application.

## Operational limits

This is application-level privacy, not encryption against the server operator. Deployment requires protected PostgreSQL/upload volumes, TLS, guarded environment secrets, initialized encrypted off-host backup storage, and restricted admin access. Fastify does not trust arbitrary forwarded IP headers; configure a restricted trusted-proxy range only if adding per-client proxy rate limiting later. At present ingress users share the proxy's API rate bucket. Review capacity if many family members use it simultaneously.

The application worker heartbeat is visible in admin diagnostics. Backup health and last-success state belong to the existing backup sidecar and Coolify. A scheduler configuration is not proof that an off-host backup can be restored. Execute and record restore drills and the physical-device checklist before production release.

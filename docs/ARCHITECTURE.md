# Architecture

## Runtime boundary

One TypeScript codebase produces a static React/Vite application and Fastify/worker/CLI entrypoints. Fastify serves the frontend and `/api/v1` on the same origin; Better Auth uses `/api/auth`. React Router handles deep links; TanStack Query keeps authorized state in memory. All writes require an exact configured Origin and authenticated session, except signed provider webhooks.

The browser receives `/api/v1/world`, an authorization-filtered snapshot for this small private installation. It never receives the complete database state. Mutations use resource endpoints listed in `src/server/app.ts`, UUID idempotency keys, and record revisions where edits can conflict. The app re-fetches after ordinary writes. Import creation instead seeds an account-scoped query for `/api/v1/imports/:id`; only that job polls every two seconds while active. The world stays on its normal twenty-second interval, and retains `imports` for older clients. Uploaded and imported images remain authenticated API resources.

## Gift discovery

Gift discovery uses separate `giftPreferences` and `giftDiscoveryJobs` record kinds. World exposes only authorized preference fields and effective feature configuration; jobs use requester-scoped endpoints. Create, review and save reauthorize inside the domain transaction, including on idempotent replay. Replay records contain operation identifiers rather than private response snapshots. A source fingerprint invalidates batches after shared preferences or accessible wish-list evidence changes.

The `gift-discovery` queue has no retries. A transaction changes pending to running and reserves account/week and installation/month usage before the only Responses request. Concurrent dispatch cannot overspend the remaining allowance. A known rejection before dispatch refunds its reservation; ambiguous failures and crashes retain it. Model work uses low reasoning, 4,000 output tokens and at most two web-search calls. Network calls run outside the state lock and recheck configuration, access and expiry before subsequent work and final publication. After deployment configuration changes, worker dispatch cancels disallowed batches and request guards enforce the effective mode. In-flight requests cannot be unbilled.

Discovery verifies source-backed URLs against a maintained retailer/reviewer registry, pinned safe-fetch DNS/redirect validation and strict structured product metadata. Ambiguous variants, missing USD price/availability, conditional prices, unknown marketplace sellers and insufficient reviews are rejected. Multiple offers must match product identifiers. Public product facts can use the import cache, with a fifteen-minute freshness ceiling; private preferences and reasons never enter that cache. Automatic photos honor the existing global setting. Discovery never invokes paid scraping or the ordinary AI importer.

Review refreshes stale offers directly, then issues a token tied to the selections, offers and destination lists. Save rechecks access, freshness and visible duplicate conflicts, applies the whole batch on a cloned state and commits it atomically. Saved items keep primary `url`, public `purchaseOffers` and `recommendationEvidence`; matching rationale stays on the private batch. Jobs expire after 24 hours, while usage counters remain available for limits and administration. Unreferenced discovery media is tombstoned on cancellation/expiry.

## Storage and transaction choice

Better Auth uses normalized PostgreSQL tables with foreign keys. Application records use a typed `app_record(kind, id, data jsonb)` table accessed through Drizzle. Each domain transaction takes a PostgreSQL advisory transaction lock, reads records, applies the domain command, and persists changed records atomically. The worker takes the same lock for its updates. Read-only projections see a committed snapshot.

This deliberately serializes domain writes across app and worker. It prevents last-unit reservation races, concurrent exchange draws, idempotency collisions, and access changes racing with reservations without adding Redis or another service. It suits a private family/friends deployment. It is **not** a high-volume multi-tenant design: memory and authorization scan costs grow with all records, and there is one domain writer at a time. If usage outgrows this, normalize high-volume entities, add foreign keys/indexes, paginate projections, and retain transactional allocation tests before changing lock granularity.

Application relations are currently enforced in domain commands rather than SQL foreign keys. Operator-written SQL can violate those relations; take a backup and use the CLI/domain operations. Versioned schema migration runs under a separate advisory lock. Dates in JSON records use ISO UTC; money is integer USD cents.

## Permission model

A recipient profile has an optional account and zero or more guardians. Anyone controlling any recipient of an item is a recipient for privacy decisions. Lists belong to recipient profiles, with pending joint owners until explicit acceptance. Selected group membership grants access to a shared list without duplicating items.

`itemVisible`, `recipient`, `giftView`, and `noticeAllowed` are the policy boundary. A Surprise recipient's DTO does not contain reservation fields, private comments, counts, or timestamps. Changing a reservation does not bump the public item's revision. Transparent views expose ordinary buyer identity/timing, but never pools or private discussion. Independent ideas always use surprise purchasing. Duplicate detection searches only visible items.

Buyer projections share coordination across the item's selected groups. Exchange reservations expose occupied quantity but hide the giver, purchase progress, and timestamps from other buyers. Exchange notes are restricted to the giver's controllers. Group owners and event leaders see aggregate delivery status without additional assignments. Personal contribution history remains available to its payer/purchaser after access loss; it grants no renewed access to a removed group's gifts.

Exchanges use the same current-member owner/event-leader permission as group events for creation, editing, drawing, cancellation, guidelines, archive, trash, restore, and purge. The rule applies to existing exchanges, including those whose creators have left. `organizerId` records the original creator and does not grant management rights. Ownership transfer and leader/membership removal immediately change authority. Group members still see exchanges and only the assignments for profiles they control.

Access loss releases unpurchased units, retains purchased quantities, anonymizes shared former-buyer identity, cancels unfulfilled pledges on the lost buyer's reservation, and preserves sent/received financial records. Archives retain records and allow existing purchase correction/release. Lists lock mode after sharing, even if unshared later.

## Group events

`groupEvents` is an application-record kind. A group may have `eventLeaderIds`; missing values mean no appointed leaders. Lists may have `groupEventId`; its absence preserves personal/joint-list behavior. No SQL migration or backfill is required.

POST `/api/v1/groups/event-leaders` accepts a group ID, revision, and selected account IDs. Only the current owner can appoint current members. POST `/api/v1/group-events` creates an event and one list per selected profile in the same domain transaction. POST `/api/v1/group-events/update` edits settings/participants or archives/restores an event with optimistic revision checks. All endpoints use the existing authenticated, origin-checked, idempotent command path.

An event owns the shared name, description, privacy, dates, and lifecycle of its linked lists. Synchronization preserves one list per event/profile, including removed participants. Membership removal and profile claims reconcile eligibility against the profile's remaining controllers; adding members/profiles does not enroll them. Date checks work before the worker runs, and `archiveDueLists` persists due events and lists together.

The world projection includes member-visible events with `canManage`. List `canEdit` remains recipient/guardian authority over gifts and summaries; `canManageSettings` permits settings only for ordinary lists. Event lists reject `lists.update`, including calls by a leader. Event leaders must use the event command. Existing item projections and purchase privacy rules apply unchanged.

Deploy the app and worker together. Older writers do not recognize `groupEvents` and can delete that record kind when saving state. See the deployment guide before upgrading or rolling back.

## Authentication and session safety

Better Auth handles email OTP and passkeys. Registration hooks require an active email-bound invitation. First administrator bootstrap creates a 24-hour grant and refuses a second bootstrap. OTPs expire after ten minutes and are stored hashed with attempt limits. Known accounts can continue signing in after leaving a group, but lose the group's access.

The deployment secret signs authentication data. HTTPS selects secure cookies. Same-origin requests and strict Origin checks protect mutations; auth retains its own CSRF/rate protections. Passkey relying-party name is Little Hint, ID is the configured hostname. Session revocation is available in Settings. A restore CLI revokes sessions, verification codes, invitations, and pending profile/ownership/Telegram links.

## Jobs and providers

PostgreSQL stores both an application outbox and pg-boss jobs. The worker dispatches pending notices/imports with exclusive singleton keys, so app restarts do not lose queued work. Jobs have timeouts/retries; completed application records suppress duplicate effects. Notice delivery records completed channels and rechecks access/preferences before each retry/channel. Exactly-once external delivery is not possible across a provider success and a process crash before acknowledgement; a notification may repeat in that narrow window.

Import failures become editable manual-entry states. An import that dies mid-flight is picked up from the durable running record. Expensive provider calls have UTC daily request caps; they are request counts, not dollar guarantees. Deployment configuration uses ENV and built-in defaults only. Empty ENV entries are unset. Database-backed app preferences use AES-256-GCM with random IVs and optional locking ENV overrides. Service-status responses expose capability states, never credentials.

New wish-list additions atomically persist inbox notices, event-time priorities, eligible channels, and a recipient/list `notificationBatches` record. An exclusive `wishlist-notification` queue processes its fixed fifteen-minute window. Per-channel and per-device receipts prevent ordinary retry duplication. Membership, access, mutes, channel choices, read state, and device activation are rechecked before formatting each attempt. Rich previews are opt-in per channel and restricted to wish-list metadata; other events retain generic external copy.

Email uses SMTP/TLS with the approved PNG logo and text fallback. Telegram links expire and are single-use; polling checkpoints reside in PostgreSQL. US numbers are parsed and verified with Twilio Verify before SMS opt-in. Signed inbound STOP/status callbacks update preferences/delivery failure state. Integration logs contain generic codes, not secrets or message contents.

## Import cache and media renditions

A separate `product_import_cache` table stores successful public retailer metadata
and AI enrichment for six hours. It is disposable and never enters `State` or a
world response. Entries contain no account IDs, user edits, import jobs, or
protected media URLs. Import jobs and media records remain account-owned on cache
hits. Parser version, relevant provider configuration, photo policy, and model
participate in hashed cache keys. The original checked time survives reuse.

Sharing requires a conservative URL key that preserves markets and variants.
Unknown query parameters, sensitive paths, and signed image URLs bypass sharing;
redirects participate in the same eligibility check. SSRF validation still runs
on hits, and every actual fetch retains DNS/redirect checks. Provider failures
are not cached. Enrichment failures preserve retailer metadata and can retry
independently. Explicit refresh bypasses stored and in-flight cached work.

Each process deduplicates matching in-flight metadata work; across processes,
concurrent cold misses can repeat provider calls. Cache writes and pruning use
a separate short PostgreSQL advisory transaction lock, never the domain lock or
a lock held during network calls. Storage is bounded to 1,000 entries and 64 KiB
per entry. Cache errors fall back to normal importing.

Settings reads select only settings rows. Each process reuses decoded values
only when the current encrypted value still matches, so there is no TTL delay
for setting changes. Summaries use one database read; staging restrictions and
environment precedence still apply.

Media keeps its canonical URL and full-size WebP. Cards request `?size=card`, a
480-pixel WebP rendition. Both routes recheck the same permissions and send
`Cache-Control: no-store`. New media gets a thumbnail immediately; legacy media
generates one on the first authorized request. Thumbnail writes are atomic,
limited to two concurrent conversions per process, and fall back to the original
on failure. No private images enter the service-worker cache.

## Import trust boundary

HTTP(S) only, no credentials/unusual ports, no local/private/link-local IP ranges. Validate every redirect and DNS lookup at connection time to resist rebinding. Bound download bytes and image pixels; re-encode accepted images to WebP. Metadata is parsed as data and rendered as text. No imported HTML or executable URLs enter the UI. Amazon has selector and structured ScrapingBee adapters; other shops use Product JSON-LD/Open Graph and generic fallback. CAPTCHA/access-denied pages become manual entry.

Optional OpenAI uses Responses structured output with no tools, `store:false`, limited fields and an evidence-only instruction. It receives product title/description, not account/group data. Provider requests necessarily disclose the product URL/content being imported to that configured provider. Manual entry and deterministic tags work without AI or paid scraping. Real retailer pages can change or block requests; fixture coverage is not a live availability guarantee.

Import enrichment returns a cleaned title of at most 160 characters, a description of 1–3 factual sentences, and 3–5 tags. The prompt preserves supported product identity and variant details while removing promotional clutter. Extraction and metadata caching retain a source title capped at 2,000 characters so the model can see details beyond the display-title limit; that internal field is stripped from import results. Metadata and enrichment cache stages are versioned. Invalid AI responses are discarded as a whole and retain retailer data. The form preserves user-edited fields when results arrive, and enrichment never rewrites saved items in bulk.

## PWA, drafts, and updates

The generated service worker caches only an explicit list of public shell/branding assets. It does not intercept `/api/` responses. Navigation falls back to the public shell offline. Private state lives in React Query memory, not IndexedDB/cache storage. Local draft opt-in stores title/URL/notes under the current account ID; sign-out clears personal draft keys. Publishing requires an authenticated form review. No offline reservation queue exists.

Installation uses capability detection with native prompts only after a tap, browser/Apple/embedded guidance otherwise. Reminders are browser-local, suppressed for 30 days/indefinitely or when standalone. The app does not claim installation after an instruction dismissal. Updates wait for an explicit click and reject activation during open/dirty forms or pending writes. Initial service-worker activation does not reload the application.

## Operational limits

This is application-level privacy, not encryption against the server operator. Deployment requires protected PostgreSQL/upload volumes, TLS, guarded environment secrets, initialized encrypted off-host backup storage, and restricted admin access. Fastify does not trust arbitrary forwarded IP headers; configure a restricted trusted-proxy range only if adding per-client proxy rate limiting later. At present ingress users share the proxy's API rate bucket. Review capacity if many family members use it simultaneously.

The application worker heartbeat is visible in admin diagnostics. Backup health and last-success state belong to the existing backup sidecar and Coolify. A scheduler configuration is not proof that an off-host backup can be restored. Execute and record restore drills and the physical-device checklist before production release.

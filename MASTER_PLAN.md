# Little Hint: approved build plan

Status: implementation and local validation. This is the durable product contract approved by the user. See [delivery evidence](docs/VALIDATION.md) for what has been tested and what remains a deployment check.

## Product and hosting

Little Hint is an invite-only PWA for families and friends to share wishes, suggest gifts, coordinate purchases, and run Secret Gift Exchanges year-round. Tagline: **Gift ideas, shared thoughtfully.**

- Display name: Little Hint. Application and cache namespace: `little-hint`.
- Deployment address: configure `APP_URL`, for example `https://littlehint.example.com`.
- Email sender: configure `SMTP_FROM`, for example `Little Hint <littlehint@example.com>`. An alias on an existing verified SMTP domain is sufficient; a separate email subdomain is not required.
- English, USD. Payments happen outside the application.
- React, TypeScript, Vite, React Router, TanStack Query; Fastify, PostgreSQL, Drizzle; Better Auth email codes and optional passkeys; pg-boss durable jobs.
- One app, one worker, PostgreSQL 18 through Docker Compose/Coolify, plus the existing Housewatch Digital backup sidecar in production. App and worker use the same image. Address, sender, integrations, and persistent upload path are configurable.
- Public guest registries and native app-store packages are deferred. AI is optional, never required for a core workflow.

## Approved identity

The sole brand source is `brand/little-hint-final.zip` and its extracted `brand/little-hint-final/README.txt`. Preserve the original package and license; deploy runtime assets under `public/brand/little-hint/`.

| Placement | Package-relative asset |
| --- | --- |
| Header | `logos/little-hint-horizontal-color.svg`, `-dark.svg` |
| Welcome, where space permits | `logos/little-hint-tagline-color.svg`, `-dark.svg` |
| Compact mark | `symbols/little-hint-tag-color.svg`, `-dark.svg` |
| Standard app icons | `icons/little-hint-app-color-192.png`, `-512.png` |
| Android maskable | `icons/little-hint-maskable-color-192.png`, `-512.png` |
| Apple icon | `icons/apple-touch-icon-color-180.png` |
| Favicon | `favicons/favicon.svg`, `favicon.ico` |
| Safari pinned tab | `favicons/safari-pinned-tab.svg` |
| Email | Supplied horizontal color PNG |

Preserve outlined lettering, custom spacing, heart cutouts, integrated tagline, aspect ratios, SVG margins, and clear space. Minimum CSS widths: horizontal 170px, tagline 360px, stacked 160px. Use a simpler variant at small widths. The wordmark and integrated tagline are artwork, not reconstructed HTML lettering.

Stable installed icons use the supplied sienna/ivory artwork with square full-bleed backgrounds. Standard and maskable purposes remain separate. App logos follow the selected app theme; the adaptive favicon follows system theme.

Impeccable guides the interface: ivory `#FFF8F0`, umber `#2B201D`, sienna `#AA4D37`, blush `#E9B5A5`, dark accent `#F1BEAD`. System sans for UI; no runtime logo font. Product images, recipient names, and useful gift details lead. Use heart-tag artwork sparingly. Include keyboard access, focus, contrast, reduced motion, safe areas, empty/loading/error/permission states.

Navigation: **Home, People, My lists, Buying, Exchanges**. Settings contains group management, integrations, account/security, personal drafts, theme, and installation. Person pages distinguish wishes from ideas for that person.

## Accounts and groups

- Registration requires an active email-bound invitation and verified email. A one-time CLI bootstraps the administrator.
- Multiple family/friend groups, membership removal/leave, explicit accepted ownership transfers, and session revocation.
- Accounts and recipient profiles are separate. Profiles may be guardian-managed; joint lists require other owners to accept before sharing.
- Linking a managed profile requires the guardian's request and confirmation by the verified target account. No automatic merge by name or email.
- A controller of any joint recipient receives recipient privacy. Guardians do not gain buyer privileges on gifts for a profile they manage.

## Wishes, ideas, and privacy

A person can own multiple named lists shared with selected groups. Sharing never copies an item: all groups see the same reservation identity.

| List mode | Recipient response |
| --- | --- |
| Surprise | Gift details only; no reservation fields, buyer identity, timestamps, private discussion, or hidden activity counts |
| Transparent | Gift details and buyer/purchase activity, identity and timing; recipient notifications require opt-in |

Mode locks when first shared, including after later unsharing. Private buying discussions remain hidden from recipients in both modes.

Independent ideas have three scopes: creator only; selected groups but hidden from recipients; selected groups and visible to recipients. Their purchases always remain Surprise. Visibility changes never promote private discussion into recipient content.

Duplicate detection uses only currently visible gifts and matching recipient/product evidence. Offer the existing gift or an explicit separate entry, with its own reservations. Never hint that an inaccessible gift exists.

Recipients can edit/archive wishes without discovering commitments. Reducing requested quantity preserves existing commitments, blocks further allocation if full, and privately informs buyers. Archiving stops new reservations and discussion but keeps history and allows existing buyers to correct/release commitments. Losing the last access path releases unpurchased units; purchased history remains with former-member identities anonymized in shared views. Preserve financial reconciliation records.

## Buying and contributions

Requested quantities, partial reservations, partial purchases, and explicit releases. Purchased units remain occupied. Transactions prevent simultaneous oversubscription; mutation keys prevent duplicate retries; revisions prevent lost edits.

A purchaser can open a contribution pool. Others pledge, mark money sent, and the purchaser confirms receipt. Targets cannot fall below existing contributions. No payment processing. Authorized nonrecipient viewers coordinate across the item's groups without gaining unrelated group access. Personal financial reconciliation remains accessible after membership changes.

## Secret Gift Exchange

- One to three distinct recipients per giver, default one, balanced incoming assignments.
- Exclude self, same-controller profiles, households when selected, and configured directed pairs.
- Prefer avoiding prior exchange matches when feasible.
- Check feasibility before creation/draw and explain restrictions without showing assignments.
- Require every participant's Surprise list shared with the exchange group.
- Freeze participants and assignments after draw; cancel and create another exchange for changes. Retain purchase history.
- Assignments are visible only to the giver and applicable guardians. Organizers see participant and delivery status.
- Shared item views show occupied exchange quantities without giver identity or purchase progress. Exchange giver notes stay with that giver/guardians. No shared contribution pools on exchange reservations.

## Security and persistence

Same-origin frontend and `/api/v1`; secure cookie sessions on HTTPS, strict Origin checks for mutations, rate limits, idempotency, revision checks. Authorization happens server-side and is re-evaluated during transactions, notification delivery, and retries. Hidden fields must be absent, including nested fields/counts and error details.

PostgreSQL holds application data and jobs. Uploaded media uses persistent storage. Do not log private descriptions, discussion, secrets, tokens, or assignments. Admin-entered settings use authenticated encryption with a deployment-supplied key. Nonempty environment settings override UI values, with source labels. Secret values never return to the browser. Paid services stay inactive without credentials and have request limits.

Privacy is application-enforced, not end-to-end encryption against the operator. See [architecture](docs/ARCHITECTURE.md) for the deliberately simple transactional storage design and its scaling limits.

## Imports and notifications

URL imports run asynchronously. Prefer structured product metadata, then retailer metadata, optionally configured ScrapingBee. Cover Amazon, Walmart, Target, Best Buy, Etsy, plus generic metadata/manual fallback. Amazon has product selectors and a structured provider adapter. Prices are USD snapshots with source and retrieval time; absent/blocked fields remain incomplete. Suggest 3–5 editable tags from evidence. Optional OpenAI descriptions/tags must not invent specifications or prices. Late import results cannot overwrite edited form fields.

Validate DNS/address ranges and each redirect, pin validated DNS resolution for fetches, bound responses, sanitize text, proxy/re-encode images with pixel limits, and reject private-network targets. Provider failures leave manual entry usable.

ForwardEmail SMTP, one-time Telegram linking, verified opt-in US SMS through Twilio. Per-channel/event preferences, generic message previews, authenticated deep links. Recheck access and preferences before each channel attempt. Respect SMS opt-out. No real provider credentials ship in source.

## PWA experience

After onboarding and the first successful gift action, show a dismissible **Keep Little Hint handy** invitation. Native installation starts only on an explicit tap when `beforeinstallprompt` is available. Otherwise show platform-appropriate browser-menu instructions. iPhone/iPad guidance covers Share → Add to Home Screen → Add, Page Menu/More where needed, and Open as Web App when offered. Embedded browsers receive open-in-browser guidance and a copyable URL.

Not now suppresses for 30 days in that browser; Don't remind me suppresses indefinitely. Settings → Install Little Hint remains available. Standalone mode suppresses reminders. Closing instructions is not evidence of installation.

Manifest: name/short_name Little Hint; description tagline; id/start_url/scope `/`; standalone display; ivory background and sienna theme. Public manifest/icons over HTTPS, origin-wide service worker, no private invitation data in launch URL. Test sessions/deep links in installed mode independently from browser sessions.

Only public application/branding assets enter service-worker caches. No authenticated APIs, lists, media, reservations, discussion, or assignments persist offline. Optional local drafts contain only the user's own title, URL, and notes, isolated by account and cleared on sign-out. Require authentication and review to publish drafts. Reservations/purchases require online confirmation.

Offer safe updates; do not interrupt open forms or pending writes. Respect keyboard, text enlargement, orientation, safe areas, and reduced motion.

## Delivery and acceptance

1. Save context/plan, repository, Compose foundation, approved assets.
2. Responsive shell, authentication, invitations, profiles/groups, authorization.
3. Lists, ideas, sharing, duplicate handling, drafts.
4. Reservations, purchases, pools, private discussion/history.
5. Imports, notification channels, admin integration settings.
6. Secret Gift Exchange.
7. Installation/accessibility/recovery and release validation.
8. Impeccable finish review and recorded design system.

Use Vitest, real PostgreSQL tests, Playwright, and physical device checks. Release requires privacy coverage for recipients/guardians/joint owners/removed members/overlapping groups; simultaneous buying and drawing; quantity reduction/archive/reconciliation; exchange balance/exclusions/anonymity; successful/failed/malicious imports and provider outages without AI; correct brand/theme/icons; physical iPhone/iPad/Android installation/authentication/deep links/relaunch; install dismissal/fallback/standalone behavior; offline draft isolation/sign-out/update safety; keyboard/screen-reader/enlarged-text/narrow-layout checks; clean deployment/migrations/retries and backup restoration.

Nightly encrypted backups through `ghcr.io/housewatch-digital/backup-sidecar:0.3.0-postgres18`, 30 daily snapshots with weekly/monthly retention disabled, and an off-host destination. Coolify schedules `backup-sidecar run`; Little Hint has no backup job or backup CLI. Document restore, invalidate sessions/invitations, reconcile post-snapshot access changes before reopening. Production activation needs DNS/TLS, SMTP, channel credentials, encryption/auth/database secrets, and initialized backup destination. The original name change had no legacy deployment/data migration requirement.

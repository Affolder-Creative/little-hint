# Little Hint

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User approved TypeScript, React, Vite, React Router, TanStack Query, Fastify, PostgreSQL, Drizzle, Better Auth, and pg-boss. Docker Compose on Coolify.

## Users

Friends and families coordinating gifts year-round, including joint recipients and guardian-managed profiles.

## Product purpose

Create wishes, suggest gifts for others, coordinate purchases without duplicates, and preserve surprises.

## Capabilities and constraints

Invite-only. Surprise and Transparent lists. Scoped suggestions, quantities, contributions without money transfer, private discussions, imports, SMTP/Telegram/US SMS, and balanced secret gift exchanges. Group events create one wish list per selected account or managed profile, shared with the entire group. Group owners and appointed event leaders manage event settings and participants; recipients manage their gifts. New members require explicit enrollment. Removed participants retain archived lists and history. Manual and scheduled list/event archiving. Optional dated gift summaries with a reveal policy locked at first sharing; amounts and private discussions stay hidden. Notification center with unread counts, opt-in browser push and supported app badges. Follow family groups, households, people, or wish lists for new items. All external channels batch additions per list for 15 minutes. Per-follow channel overrides and absolute list mutes supplement account defaults. Optional previews show names, list names, and event-time priorities, independently enabled per channel. Private notes support scoped @mentions and watching. Optional AI. No guest registries. Local personal drafts only while offline.

Optional wish-list priorities (Most wanted, Would love, Nice to have) are independent of shared item order. Viewer sorting and personal collection order persist per account. Archive, Trash, restore, and explicit permanent deletion are separate actions, with no automatic Trash purge. Removing a group event preserves its participant lists. Deleting a gift source preserves existing buying and contribution records without exposing them to surprise-list recipients. Drawn exchanges must be cancelled before removal; archiving retains assignments.

Exchanges and group events support optional USD spending guidelines per giver
and recipient. Guidance uses accessible plans and listed-price estimates, never
blocks purchases or contributions, and compares shared gifts by their full cost
while counting personal shares separately. Exchange organizers may change the
guideline after drawing without changing assignments. Cost sharing remains
unavailable for secret-exchange gifts.

## Brand commitments

Little Hint. Gift ideas, shared thoughtfully. Use approved brand/little-hint-final artwork without reconstructing its lettering. Warm palette and accessible light/dark interface.

## Voice and terminology

Write for friends and family making gift plans. Be warm and direct. Welcome screens,
empty states, and marketing can play with “drop a hint” or “take a hint.” Use that
wordplay sparingly. Instructions, privacy choices, errors, and purchases stay plain.

- An **item** goes on a wish list, including lists shared by several people and
  lists managed for someone else. Use Add item, Item name, Edit item, and Search items.
- A **gift idea** is something saved for another person outside their wish list.
  Use Add gift idea, Gift idea name, and Edit gift idea. Givers can start from a shared wish list; the idea stays with its recipient. Only me remains the default and covers reservation and purchase activity.
- A **gift** is something someone plans to give. Use Reserve gift and Mark as purchased.
- **Wish list** names the collection. **Hint** adds personality, not a new data type.
- Keep navigation and headings recognizable. Use short sentences and name the next
  action. Match screen-reader labels to the visible actions.
- Say Keep it a surprise or See the plans. On phones, status badges may shorten the first label to Surprise with the lock icon; privacy choices and explanations retain the full wording. Explain summary dates and sharing
  restrictions without promising permanent secrecy when a reveal is scheduled.
- Family groups share lists. Households prevent exchange matches when that rule is
  enabled and can be followed for additions to member-owned lists shared with their family group. Keep those concepts distinct. Shared ownership is different from viewing.
- Family-group creation defaults to every signed-in account. Administrators can restrict new groups to app administrators; FAMILY_GROUP_CREATION=everyone|admins overrides and locks that preference. Existing group ownership, membership, invitations, and events retain their permissions.
- Settings → Invitations lets any signed-in user invite someone to their own account without a family group. Solo users start with private wish lists and can accept separate group invitations later. An account invitation does not connect profiles or share lists.
- Never imply that a reservation buys something, a contribution sends money, or
  cancelling a reservation cancels a shop order. Invitations waiting for delivery
  are not yet sent. External notification previews never include private gift details. The signed-in notification center shows only context the viewer can currently access.
- Keep the approved tagline, Gift ideas, shared thoughtfully. Technical names belong
  in setup instructions only where they help someone configure the app.

## Operating context

Mobile and desktop browsers and installed PWAs. Operators configure the public address and SMTP sender independently. English and USD initially.

## Product principles

- Authorize on the server and exclude hidden fields entirely.
- Preserve surprise privacy in errors, counts, notifications, and edits.
- Require online transactional confirmation for purchases.
- Optional integrations never prevent manual gift entry.

## Evidence on hand

Approved logo package only. No real user gift data; development fixtures must be labeled.

## Accessibility

Keyboard access, readable contrast, reduced motion, screen readers, text enlargement, and mobile safe areas.

## Gift discovery

Recipient interests and likes/avoid notes are private by default, editable by owners and guardians, and shareable with selected family groups after confirmation. New accounts get skippable setup on their initial Home visit, with a warm welcome banner and a full-width Skip for now action. Skipping leaves unfinished edits unpublished and immediately shows Home with an optional reminder below the greeting. Navigation defers setup for the current signed-in visit, and direct links remain accessible. Accounts without completed or dismissed setup see the same Home reminder. Saving preferences removes it; dismissing it permanently stops reminders. Historical skips and dismissals remain respected. Preferences remain usable when AI is off. Edit profile includes Profile and Gift preferences tabs, with direct Gift preferences shortcuts on owned/managed person pages and in Settings.

AI suggestions default to givers only, with admin modes Off / For others / For own lists / Both and a locking environment override. Managed profiles count as own lists. Each search targets one person; a joint list can be a save destination. Without shared preferences, users review locally inferred interests from visible, active wish-list titles and tags before searching.

Givers must enter a maximum USD price per item, excluding tax/shipping. Own-list searches may omit it for a price mix up to $200. A batch has up to twelve checked physical products, shown six at a time, with one to three shop offers and customer/editorial evidence. Shuffling is free; an explicit new search uses an allowance. Defaults are three per account per UTC week and 100 for the app per UTC month across all recipients and modes. Private batches expire after 24 hours; dispatched failures count and are never retried automatically.

Users select gifts, edit public notes, choose destinations and confirm before saving. Own-list gifts support a default list and per-item overrides. Giver suggestions become independent ideas, private by default, using existing sharing choices. Offers older than fifteen minutes are refreshed without AI; current prices appear in final review. Unverifiable or over-budget offers cannot be saved. Duplicate checks use visible gifts only and require an explicit separate-entry choice. Batch saves are atomic and never reserve or purchase gifts. Private search notes and matching reasons stay out of saved item descriptions.

Off hides discovery controls and unsaved results, blocks endpoints, cancels pending work and discards in-flight results. Already dispatched requests may still be charged. Saved gifts and preferences remain available. Staging disables external AI discovery.

Selected accounts may receive server-configured higher or unlimited weekly AI allowances and a separate monthly exemption. Monthly-exempt searches remain in total usage reports without consuming the shared allowance. Exceptions never override Off, staging/preview isolation, or recipient permissions.

Gift-suggestion mode, limits, and model are configured only through deployment environment variables. Monthly usage separates gift suggestions, product-detail AI, and paid shop lookups. It appears when a service is available or provider submissions/requests exist in the current UTC month. Disabled services with current-month usage say Currently off; prior-month records and skipped SMS attempts alone do not keep sections visible. Older records remain stored. Unknown or older token usage is labeled as unavailable; estimates cover recorded usage at known rates and are not a complete bill.

Administration contains App settings, This month's usage, Service status, and Background jobs. Family-group creation, automatic product photos, device photo caching, and preloading are editable, with optional locking ENV overrides. All service credentials, providers, models, limits, and AI availability are deployment-only. Service status reports configuration presence, not verified connectivity. Preserve usage after disabling services, notification retries, failed shop lookups, and the note that backup status is unavailable.

SMS and Telegram require explicit deployment enabled flags set to true plus
complete provider configuration. Staging supports both through dedicated prefixed
flags and credentials; preview keeps both disabled. Unavailable channels are
hidden throughout personal settings, follows, and SMS sign-in, while administrator
Service status remains visible. Connections, consent, and saved choices survive
disablement. Suppressed updates remain in the inbox and are never caught up after
re-enabling. Configured but unconnected channels still offer setup.

Product lookups support Bright Data retailer scrapers for Amazon, Walmart, Target, and Best Buy US product pages, plus Web Unlocker after built-in extraction for other shops. New wish-list imports are private server-saved drafts until explicitly added. Configuration and limitations are documented in [Shop lookup configuration](docs/shop-lookups.md).

`SCRAPING_PROVIDER=none` means manual product entry, including no direct extraction or product-detail AI. Existing drafts and uploaded photos remain usable. `auto` retains direct extraction and configured paid services. Gift discovery is independently configured.

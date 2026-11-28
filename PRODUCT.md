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

Invite-only. Surprise and Transparent lists. Scoped suggestions, quantities, contributions without money transfer, private discussions, imports, SMTP/Telegram/US SMS, and balanced secret gift exchanges. Group events create one wish list per selected account or managed profile, shared with the entire group. Group owners and appointed event leaders manage event settings and participants; recipients manage their gifts. New members require explicit enrollment. Removed participants retain archived lists and history. Manual and scheduled list/event archiving. Optional dated gift summaries with a reveal policy locked at first sharing, co-manager access, or gift-planning activity; amounts and private discussions stay hidden. Notification center with unread counts, opt-in browser push and supported app badges. Follow family groups, households, people, or wish lists for new items. All external channels batch additions per list for 15 minutes. Per-follow channel overrides and absolute list mutes supplement account defaults. Optional previews show names, list names, and event-time priorities, independently enabled per channel. Private notes support scoped @mentions and watching. Optional AI. No guest registries. Local personal drafts only while offline.

Optional priorities for wish-list items and gift ideas (Most wanted, Would love, Nice to have) are independent of shared item order. Viewer sorting and personal collection order persist per account. Archive, Trash, restore, and explicit permanent deletion are separate actions, with no automatic Trash purge. Removing a group event preserves its participant lists. Deleting a gift source preserves existing buying and contribution records without exposing them to surprise-list recipients. Drawn exchanges must be cancelled before removal; archiving retains assignments.

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
  Use Add gift idea, Gift idea name, and Edit gift idea. Givers can start from a shared wish list and privately associate the idea with that list; the idea stays with its recipient and keeps its own audience. Only me remains the default and covers reservation and purchase activity.
- A **gift** is something someone plans to give. Use Reserve gift and Mark as purchased.
- **Wish list** names the collection. **Hint** adds personality, not a new data type.
- Keep navigation and headings recognizable. Use short sentences and name the next
  action. Match screen-reader labels to the visible actions.
- Say Keep it a surprise or See the plans. Gift context uses Surprise with an eye-off icon, recipient-visible states with an eye icon, and Only me with a lock. Phone card triggers may show only the icon while retaining accessible text and the full explanation in help; privacy choices retain the full wording. Browsing cards keep privacy explanations in help opened by hover, tap, click or keyboard activation; gift details retain the full explanation. Source and private spending captions remain visible. Explain summary dates and sharing
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

Administration contains App settings, This month's usage, Service status, and Background jobs. Family-group creation, automatic product photos, device photo caching, and preloading are editable, with optional locking ENV overrides. Administrators choose independent Gift card layouts for Smaller screens and Larger screens, applying to everyone. Defaults are Large photos at 650px and below and Compact cards above 650px. Both retain source and privacy information, and resizing across the breakpoint applies the matching choice immediately. Existing larger-screen selections remain saved; installations without a smaller-screen choice start with Large photos. Both choices save or discard together. All service credentials, providers, models, limits, and AI availability are deployment-only. Service status reports configuration presence, not verified connectivity. Preserve usage after disabling services, notification retries, failed shop lookups, and the note that backup status is unavailable.

SMS and Telegram require explicit deployment enabled flags set to true plus
complete provider configuration. Staging supports both through dedicated prefixed
flags and credentials; preview keeps both disabled. Unavailable channels are
hidden throughout personal settings, follows, and SMS sign-in, while administrator
Service status remains visible. Connections, consent, and saved choices survive
disablement. Suppressed updates remain in the inbox and are never caught up after
re-enabling. Configured but unconnected channels still offer setup.

Product lookups support Bright Data retailer scrapers for Amazon, Walmart, Target, and Best Buy US product pages, plus Web Unlocker after built-in extraction for other shops. New wish-list imports are private server-saved drafts until explicitly added. Automatic provider selection prefers Bright Data, ScrapingBee, Scrape.do, then Scrapingdog. Bright Data requires an API key and Unlocker zone. Explicit selections never fall through to another paid provider. Configuration and limitations are documented in [Shop lookup configuration](docs/shop-lookups.md).

`SCRAPING_PROVIDER=none` means manual product entry, including no direct extraction or product-detail AI. Existing drafts and uploaded photos remain usable. `auto` retains direct extraction and configured paid services. Gift discovery is independently configured.

Private-note authors may edit active notes and delete visible notes, including archived notes. App administrators may delete already-visible notes but cannot edit others’ notes or bypass surprise/exchange privacy. Edits notify newly added mentions only. Gift-idea import drafts remain private until explicitly saved, retain recipient and audience choices, and recover on the recipient’s Gift ideas tab or in Your drafts.

## Spending and shared planning

Spending tracking is optional and disabled by default. Buying includes private actual-cost history, outstanding estimates, manual purchases, refunds, personal occasions, and optional budgets by person, list, event, occasion, and period. Missing amounts remain unknown. Joint gifts use editable recipient shares with exact cent allocation. Purchase records retain authorized source snapshots when lists or items disappear. Existing purchase statuses import without invented prices or purchase dates.

Each account can connect with one consenting spending partner, independently of households. Each person selects recipients or occasions for automatic sharing of new entries. Existing history requires explicit sharing. Gifts for either partner and secret exchanges remain private. Private ideas are excluded from automatic sharing. Both partners can edit shared budgets; editing shared purchases requires both to accept joint editing. Payer and editor stay distinct, and changes have an audit history. Disconnection or pausing removes shared access without deleting personal records. Source wishlist access remains separately authorized.

Listed prices estimate plans; recorded payments, contributions, reimbursements and refunds determine personal spending. Combined totals do not double-count internal partner transfers, including across calendar-year boundaries. These records do not transfer money or contact shops. USD only.

Wishlist selection in Add purchase links the spending record and purchased status in one transaction. Manual names remain supported. Search uses authorized gifts and outstanding reservations; choosing a suggestion alone saves nothing. Linked recipients and source event stay attached to the gift. Amounts remain unknown until entered or an estimate is explicitly accepted.

The deployment-only SPENDING_ENABLED switch defaults to available; false hides and disables the new spending feature without deleting preferences or records. Normal buying, listed prices, contributions, and existing event spending guidelines remain available. Personal tracking starts off unless enabled by the saved new-account default. Each person retains their own off switch.

App administrators can enable private spending tracking by default at first verified
account activation. This saved preference starts off and does not change existing
accounts. Each person retains their off switch, and partner consent and sharing
rules remain unchanged. Newly enabled people see an explanation in Spending
settings and their spending view. No external notification is sent.

Gift ideas may be privately assigned to an accessible wish list for their recipients, even without spending tracking. The creator sees those ideas alongside the list’s wishes. Manual spending records can also be assigned when tracking is enabled. Assignment updates spending totals, budget scope, and the list’s group-event context without adding the gift to the list or changing sharing. Plans pass their assignment to later purchases; purchase reassignment also updates related refunds. Source wish-list gifts retain their source context.

## Friends before signup

Your people offers Add a friend separately from Managed profile. A friend needs
only a name and starts private. Before connection, the creator manages its name, selected family
groups, connection invitation, and archive state. After connection, each gift idea
author manages that idea through the ordinary sharing choices. Earlier audiences
are preserved and the entry no longer limits sharing or controls other authors’ ideas. Collaborators own their own
ideas and use normal purchase, contribution, and discussion permissions. Sharing
a friend never publishes existing private ideas. Ideas saved through a friend
entry offer Only me or selected groups, hidden from the recipient.

Connecting requires a seven-day email invitation and explicit acceptance after
verified sign-in. The invitation permits signup but sign-in alone does not connect.
Existing accounts use the same flow. Connection preserves gift authorship and
sharing, grants no wish-list or preference access, and joins no groups. Separate
entries accepted by the same account appear as one person while retaining their
original sharing boundaries. Names alone never merge people.

Removing a group from a friend entry revokes access granted through that entry.
Authors retain their ideas and buyers retain authorized history. Restoring group
access does not republish ideas. Archiving cancels pending invitations and stops
group sharing without deleting gifts or history; restoration starts private.
Unconnected friends cannot own lists or enter households, events, or exchanges.
The feature is built in, without an environment or personal enable switch.

## Price tracking

Deployment-enabled daily price checks cover active linked wishes and gift ideas with an existing price. Missing-price items cannot subscribe or resume tracking, enter scheduled checks, or accept queued/in-flight results after the price is removed. Initial product-detail imports can still fetch a first price.
The current verified price leads, with the original saved price and verification
time retained. Failed checks preserve the previous amount. Manual price changes
pause automatic updates until an editor resumes them. Existing items establish a
baseline when tracking starts. Changing the shopping link starts a new comparison.
Private per-item subscriptions notify at new lows of at least 5% and $1. Inbox
alerts respect current access; external channels require explicit topic opt-in.
Recorded spending remains separate from changing listed-price estimates.

Gift idea creators can choose a private wish-list association independently of spending tracking. Existing spending defaults supply that association. The default and recipient allocations are returned only to the creator, including when another viewer is an administrator. Cards and details distinguish On a source wish list from For a privately assigned list. Both regular and group-event list pages combine wishes with the creator’s explicitly assigned ideas, filtered by All, Wishes or Gift ideas. Unassigned ideas remain on the person’s Gift ideas page. Assignment changes neither audience nor lifecycle; list archival and deletion do not archive or delete associated ideas.

The creator's new plans inherit the choice; saving a changed assignment previews and updates their existing unassigned plans and purchases, including related refunds. Already assigned records and other buyers' records retain their context. Clearing the default removes the idea from that list’s private browsing view and affects future plans only. When tracking is off, assignment edits leave existing financial records unchanged. Assignment never publishes the idea or changes its audience. The Purchased view offers a combined status and recorded-spending editor. Occasion and wish-list filters count explicitly linked or assigned gifts; guided review helps organize unassigned entries.

## Managed profiles and account administration

Managed profiles start private. Their manager can enable family-group sharing, then select specific groups from their current memberships. Those groups can discover the profile and enroll it in group events. New wish lists created from the managed profile start with those groups selected and retain the normal sharing review. Existing list audiences stay independent, and gift ideas stay private until explicitly shared. Existing managed profiles retain their previous group visibility during migration.

Managers can create wish lists and add wishes or gift ideas directly from a managed person's page. They can reserve and purchase gifts for an unsigned managed recipient, with aggregate availability and their own reservation details. This does not reveal other shoppers' private ideas, identities, notes, or spending. The signed-in person's own wishlist hides Your spending, including lists created for group events.

Profile takeover uses a seven-day email invitation that permits signup, followed by explicit acceptance. It preserves list and gift identities, merges references into the recipient's existing account profile, and redirects old profile links. The recipient keeps their account name and chooses which gift preferences to retain when needed. Conflicting event or active exchange participation must be resolved first. Group membership still requires a separate invitation and acceptance.

Family-group invitations have a separate administrator policy from group creation. Group owners can always invite. When member invitations are enabled, other current members can invite too. Otherwise, members can request an invitation for the owner to approve or decline. Sending or approving an invitation never adds a member before acceptance.

New account activations require first and last name before entering the app. Existing accounts are not forced through setup. Profile names and authentication account names stay synchronized. Administrators can search accounts and managed profiles and edit their display names without opening private gift preferences or changing their email addresses.

Administrators can review and delete another account with exact DELETE confirmation and an explicit data choice. Keep shared content removes private data and preserves shared content anonymously for its remaining audience. Remove their content deletes sole-owned lists and authored gifts, removes authored note bodies, and retains other people's completed buying history anonymously. Both choices revoke sign-in sessions. Ownership and sole-guardian responsibilities require accepted handoffs. Unpurchased reservations and unsent pledges can be cancelled from the review; sent contributions and active exchanges must be settled first. Reviews are invalidated by relevant intervening changes, and administrative resolutions/deletions leave an audit record without contact details.

## Managed-profile ownership

Managed profiles have one owner and may have multiple co-managers. The owner adds connected account holders in Edit profile; saving grants access immediately. Co-managers edit profile details, wishes, preferences and sharing, while only the owner changes managers or invites the recipient to take over. Ownership transfers require acceptance within 24 hours, with an option to keep the previous owner as a co-manager. Owner account deletion requires an accepted transfer even when co-managers remain. Deleting a co-manager removes their access.

## Gift-plan lifecycle and settlement

Archiving, removing, or restoring wishes privately updates affected buyers and contributors through Changes affecting my gift plans. List operations group affected plans per account. Wish availability and purchase status remain separate. Archive/delete confirmations never reveal hidden commitments. Existing purchases and financial records survive source removal; permanent deletion after Trash sends no duplicate removal alert.

Existing buyers review archived wishes before continuing. Removed sources cannot accept new purchases. Existing pledges may be cancelled or marked sent after reviewing the changed source. Restoration never revives cancelled commitments. Cost-sharing updates remain available to the buyer and relevant contributor after removal. External messages stay generic.

Buyers may record full or partial contribution returns after confirming the original payment received. Contributors confirm return receipt separately. Unconfirmed mistakes may be voided; confirmed returns are immutable. These records do not transfer money. Optional Spending preserves original payments, records return dates independently, and excludes internal partner transfers from combined totals. Pending return receipts must be settled before a financial participant closes their account.

## Saved wish-list drafts

Every user can save an item as a server-backed draft with an item name and a
destination wish list. Drafts are visible only to their owner while they retain
list-editing access, and to current guardians of managed recipients on that list.
Joint ownership alone grants no draft access. Published items retain the list's
normal audience. Drafts cannot be bought, discussed, or automatically price-checked.
Publishing is explicit and one-way. Active publication emits the usual new-item notification once; archived publication does not.
Profile takeover transfers guardian-created drafts to the incoming account holder.
Unfinished product lookups remain creator-private until explicitly saved; offline
drafts remain device-only. Saved drafts are available in My lists and the destination list.

## Item photos

Wishes and gift ideas support optional photo galleries, including saved drafts. Shop lookups still import one photo. Editors upload additional photos, replace or remove photos, and choose a cover; other photos retain upload order. The deployment-only ITEM_PHOTO_LIMIT defaults to five total photos including the imported photo. Cards retain the cover with a photo count. Detail galleries load only for multiple photos, with manual swipe, button, and keyboard navigation. Existing galleries survive a reduced limit.

Group events have an optional calendar event date, separate from archive and reveal schedules. Repeated events start without an event date. Shared-cost setup records full estimated cost and the buyer's intended share, deriving the external contribution goal. Existing pledges constrain reductions. Personal spending remains full cost minus net pledges until others commit; setup never creates a payment. Legacy goals remain unchanged until explicitly edited.

## Archive privacy

The app-wide Archive privacy preference defaults off. HIDE_ARCHIVED_ITEMS_FROM_OTHERS=true|false overrides and locks it; blank leaves it editable. Enabled, it hides manually and automatically archived wishes and ideas from other users. List owners and existing profile managers retain wishes; idea creators retain their ideas. The policy does not cancel commitments or change sharing. Buyers and contributors retain personal records and saved names, while hidden live items cannot be opened or used for new purchases. Lists and events retain their existing visibility.

Personal archive privacy defaults off and remains editable under global enforcement.
The global setting requires hiding for everyone; disabling it lets personal choices
apply. Wishes follow any current joint owner's choice; unsigned managed profiles
follow their designated owner's choice. Ideas follow their creator. Ownership
changes use the new owner's preference. Personal settings never force disclosure.

## Discussion and notification cleanup

Shared gift ideas show creator attribution. Selected mentions are colored while composing and are excluded from subsequent suggestions until removed. Discussion audience details use one compact label with contextual help; protected history and exchange restrictions retain their distinct audiences.

Notifications open on Unread. Each account can dismiss notifications or dismiss all read entries through the displayed snapshot, with a brief Undo restoring the original read state. Dismissal persists across devices, affects inbox lists and counts only, and preserves authorized source links and external delivery behavior. There is no automatic purge or separate archive.

## Joint gift ideas and audience exceptions

One gift idea can have up to twenty connected or managed recipients. It appears
on each recipient's Gift ideas page for authorized viewers while sharing one
quantity, discussion and set of plans. Unconnected friend entries remain singular.
Recipients become permanently fixed when gift planning first begins, including
when plans are later cancelled. Existing joint spending allocations apply.

Only me remains the default. Selected groups can see an idea with all recipients
hidden, with additional account exclusions, or with recipients included. Explicit
exclusions override every selected group and persist across membership changes.
Profile managers participate through their independent access. Notes preserve
account exclusions and historical surprise recipients when written or edited.
Restoring access never publishes protected earlier notes. Revocation releases
unpurchased reservations and unsent pledges, preserves financial history and
settlement, and prevents spending-partner sharing from bypassing exclusions.

## Joint-gift spending assignments

A gift idea may have one private spending-list default per recipient and equal or custom relative shares. These defaults belong to its creator and pass to their new plans and purchases. List and event totals count only matching recipient shares; an overall total counts each payment once. Shares use exact cents, including odd amounts. Unassigned shares remain in person and overall totals. Changing idea defaults previews missing assignments on the creator's existing records without changing saved shares or assigned destinations. Purchase edits propagate allocations to refunds. Existing scalar assignments are read as equivalent per-recipient snapshots; schema 12 prevents older runtimes from ignoring new allocations.

New items and gift ideas offer an unchecked archive checkbox. The choice survives import autosaving, saved wish-list drafts and local personal drafts. Publishing an individually archived draft places it directly in Archived items; archived destination lists still block publication.

## Administrative roles

Multiple app admins manage the installation; primary family owners and additional family admins manage their groups. Admin editing requires existing content access and preserves private content, recipient surprise, audience, reveal and financial permissions. App admins can administer membership in unjoined groups without joining automatically. Additional family admins must be current account-holding members. Only app admins gain additional permanent-deletion authority. The last app admin cannot be removed; primary ownership transfers by acceptance.

## Shopping offers and product groups

Items and gift ideas support several labeled shopping offers for the same product and variant. The primary link supplies product details; additional links preserve the chosen name, description and photos. Each offer retains its own price and verification time. One private subscription follows the lowest fresh verified price, with the existing daily schedule, provider allowances, 48-hour freshness window and 5%/$1 alert threshold. Changed offer membership establishes a fresh reference without an alert. Failed checks preserve saved amounts; recorded payments and commitments remain independent.

Product groups share a name, description, gallery and audience while each product retains its own quantity, shopping offers, gift plans, discussion and spending. Wrapping an existing item preserves its identity and commitments. Browsing presents the group once and Buying identifies the individual product. Groups cannot be reserved as a whole or nested. Group privacy and lifecycle apply to the products; purchase and settlement history survive removal. Different acceptable alternatives are not treated as equivalent offers.

## Price ranges

Items and gift ideas, including individual products in a group, accept an optional exact USD price or increasing range in one field. A Range button retains the decimal keypad and inserts the separator. Recognized USD paste formatting is normalized; ambiguous text is rejected. Unfinished lookup and device drafts preserve incomplete text until an item is saved.

Cards, details, Buying and purchase references display both endpoints. Group totals sum both endpoints with quantities. Ascending sorting uses the lower price; descending uses the upper. New estimates use the upper price and explain their basis; existing saved estimates and payments retain their values. Ranged purchases require an entered actual amount or retain an unknown amount.

Ranges pause automatic checks and alerts, including in-flight results, until an exact price is saved and an editor resumes checking. Shopping offers retain exact prices independently. A ranged idea remains one gift plan rather than a product group. Schema 15 protects these semantics from older app and worker versions.

## Price source and Buying order

Each item or product explicitly uses shop prices or a custom price/range. Shop pricing prefers the lowest recently verified offer, then the lowest saved shop price. Manual entries without priced shops expose the ordinary price field. Custom entry survives new links, lookup completion, drafts and product grouping; it never changes a retailer's saved price. Removing the final shop preserves the displayed amount as custom. Custom pricing pauses checks, and selecting shops does not silently resume paused checks. Schema 16 preserves existing amounts and keeps differences and ranges custom.

Buying starts with newest reservations and remembers one account-level sort across its status views and devices. It also supports oldest, alphabetical ascending/descending, and listed unit price ascending/descending. Sorting precedes pagination; missing or inaccessible prices sort last. Range sorting uses the lower or upper endpoint respectively. Contributions and cancelled history keep their existing order.

## Gift arrival tracking

Buying combines wishes, gift ideas and standalone purchases in one buyer-private checklist. Purchased includes any plan with purchased units; partially purchased plans also remain in Needs buying. Linked spending entries never duplicate a gift. Purchased offers All purchased, Awaiting arrival and In hand filters. Arrival tracks quantities independently of costs, refunds and contribution receipts. New purchases start awaiting arrival; historical purchases retain unknown arrival status. Only the buyer or standalone purchase owner can read or update possession, including when shared spending permits financial edits. Retained purchases remain updateable after source removal. Standalone purchases follow Spending availability and enablement. Schema 17 protects arrival privacy from older runtimes; upgrade app and worker together.

## Contribution offers

Eligible nonrecipient shoppers can offer a specific USD amount toward a shared gift before reservation or before a buyer opens cost sharing. Offers reserve no quantity. A buyer explicitly accepts exact amounts when reserving or editing cost sharing; acceptance creates ordinary contributions. Pending offers count once in the contributor's private Still planning estimate and do not reduce a buyer's estimate. Contributors can edit or cancel pending offers; becoming the buyer closes their own pending offer. Source archival, removal, or revoked access cancels pending offers without reopening them on restoration. Offers lock gift-idea recipients and remain excluded from recipient views and secret-exchange reservations. Account closure and exports include offers. Schema 18 requires app and worker to upgrade together.

## Wish-list identity and gifting-mode corrections

Standalone wish lists may select one of 180 bundled Lucide icons in Create/Edit list. Search covers labels, categories and common terms for equipment and hobbies, including fire, knitting and vinyl. No selection or an unavailable key uses the existing checklist; group events retain their calendar.

Authorized recipients, profile managers and wish-list co-managers may change gifting mode until the first reservation, contribution offer or contribution, purchase, or discussion note. Wishes, drafts, views, watches, private idea associations and spending organization do not lock it. The lock persists after cancellation, deletion, unsharing or loss of co-manager access. A reveal date alone does not lock gifting mode; existing reveal-scheduling restrictions remain. Group owners and appointed event leaders change every participant list together; activity on any attached list permanently locks the event even after that participant leaves. Administrative editing alone grants no policy authority.

Existing locked lists and existing events retain their locks on upgrade. All locked states use “Gifting mode can no longer be changed.” The existence of a lock may indirectly suggest planning, an accepted tradeoff; no actor, item, cause, count or time is exposed. Surprise gifts and discussion remain hidden from recipients, apart from existing scheduled-summary rules. Stale gift-planning submissions preserve entries and require explicit review of the changed mode. Review appears at first sharing/access and on actual mode changes, not on routine icon/name edits. Schema 20 requires app and worker upgrades together. See ADR 0008 and issue #301.

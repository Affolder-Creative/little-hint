# Surprise privacy audit

Audited November 5, 2026 against commit `009a014032a1f62b14dda8dffae70dca77610254`, app version 0.18.0.

**Historical audit result: four high-priority issues were reproduced.**

Implementation follow-up: the spending and exchange fixes are implemented in the accompanying PR stack for 0.19.1. The diagnostic command now runs maintained regression tests and succeeds when protections hold. See [release readiness](PRIVACY_RELEASE_0.19.1.md) for current validation and deployment limits. The ordinary Surprise wish-list projection protects recipients well. The gaps occur when exchange shopping loses its context, note audiences depend on reservation state, and Spending applies different privacy rules from gifts.

This audit checks the approved behavior in [MASTER_PLAN.md](../MASTER_PLAN.md), [PRODUCT.md](../PRODUCT.md), and [ARCHITECTURE.md](ARCHITECTURE.md). It covers application routes, API responses, mutations, counts, notification eligibility, profile roles, lifecycle changes, and browser workflows. It does not assess regulatory compliance, production infrastructure, or dependency vulnerabilities. All execution used synthetic local data. Application behavior was not changed.

## Findings

P1 means a disclosure or workflow mistake that should be corrected before relying on the affected surprise feature. No P0 finding was identified in the audited paths. Findings are numbered to match the executable reproduction script.

### F1 · P1 · Shopping from an exchange defaults to an ordinary reservation

**Who learns the surprise:** Other shoppers can see the giver's identity, reservation time, and subsequent purchase progress. A recipient can later see the giver in a scheduled summary even when that summary excludes exchange gifts.

Reproduction:

1. Draw a secret exchange with several participants and shared Surprise lists.
2. As a giver, open Exchanges and follow the assignment under "Who you're giving to."
3. Open an item on the assigned recipient's page.
4. Leave "Buying for" unchanged and select "Reserve gift." It defaults to "Not part of an exchange."
5. Another shopper sees the giver's real name under Gift plans. The API returns `exchange: false`, `buyerName`, `reservedAt`, and `purchased`.

The assignment link carries only the recipient ID. Item links also carry no exchange context. `GiftDetail` initializes the selected exchange to an empty string and submits undefined exchange fields. The server correctly treats that payload as an ordinary reservation, so the exchange anonymity rules never apply.

The synthetic reproduction also marks that reservation purchased on a list with an elapsed reveal date and `revealExchangeGivers: false`. The recipient's summary includes the giver because the reservation was classified as ordinary.

Source locations:

- [Exchanges.tsx](../src/client/Exchanges.tsx), line 237, assignment navigation.
- [components.tsx](../src/client/components.tsx), `GiftCard`, item navigation.
- [App.tsx](../src/client/App.tsx), lines 1096 and 1309, default selection and reservation submission.
- [domain.ts](../src/server/domain.ts), lines 240 and 317, summary filtering and ordinary buyer disclosure.

**Recommended correction:** Preserve the exchange, giver, and recipient context through assignment navigation, person/list browsing, and gift details. Show that context beside the reservation action. When several assignments match, require an explicit choice. Review the "Record a purchase" route too: its direct-item flow creates an ordinary reservation and currently has no exchange choice. Continue to support intentional non-exchange gifts, but make that a clear decision when shopping from an exchange.

### F2 · P1 · Exchange notes become ordinary shared notes before reserving or after release

**Who learns the surprise:** Other authorized shoppers, including people who should not know the giver's exchange plans. The recipient is still excluded from the note itself.

The gift page promises that notes from an exchange giver are visible only to that giver and people managing their profile. The actual audience depends on an active exchange reservation for that exact item, owned by the account posting the note.

Reproduction:

1. Open an assigned recipient's item before reserving it.
2. Post a note describing the exchange plan.
3. Another shopper can read the note and its author's name. That shopper can also appear in the mention picker.
4. Make a correctly tagged exchange reservation and post another note. This new note is restricted as expected.
5. Release the reservation and post a third note. Its audience expands to other shoppers again, with no audience change shown in the composer.

The first and third notes have no `giverId`. The projection interprets that as a normal nonrecipient discussion. Reserving later does not make earlier notes private. Existing scoped notes remain scoped after release; the defect affects newly posted notes.

Source locations:

- [domain.ts](../src/server/domain.ts), line 1500, note scope inferred from an active reservation.
- [activity.ts](../src/server/activity.ts), line 47, note visibility and mention scope.
- [App.tsx](../src/client/App.tsx), line 1416, the stronger privacy promise shown to users.

**Recommended correction:** Give notes an explicit, server-authorized audience independent of whether a reservation exists. Preserve exchange context from the shopping flow and display the actual audience before posting. Use that same audience for mentions, watches, inbox entries, edits, and delivery checks. Releasing a reservation must not silently broaden the next note's audience. Existing unscoped notes need deliberate review; their original intended audience cannot be safely inferred from the current reservation alone.

### F3 · P1 · Spending sharing bypasses managed-profile recipient protection

**Who learns the surprise:** A recipient's guardian who is also the giver's spending partner.

The approved policy treats anyone controlling a recipient as a recipient for privacy, including guardians and any controller of a joint recipient. The main gift response follows that rule. Spending checks only the recipient's `userId` against the two partners and ignores `guardians`.

Reproduction:

1. Create a managed recipient and a shared Surprise list for them.
2. Connect the guardian and another giver as consenting spending partners.
3. Have the giver enable automatic sharing for that managed recipient.
4. Have the giver reserve an item on the managed recipient's list.
5. The guardian's gift response omits reservations, but Spending returns the gift title, payer, amount estimate, and a shared record count.

The diagnostic returned "Managed surprise bicycle," the giver's name, and a $150 planned total to the guardian. The same protection predicate governs explicit sharing, shared editing, and shared ledger visibility, so this is not limited to one display component.

Source locations:

- [spending.ts](../src/server/spending.ts), line 59, partner exclusion and sharing authorization.
- [domain-access.ts](../src/server/domain-access.ts), `controllers`, `controls`, and `recipient`, the existing recipient policy.
- [SpendingPurchase.tsx](../src/client/SpendingPurchase.tsx), line 356, the corresponding client check also omits guardians.

**Recommended correction:** Apply the same controller-based recipient rule to spending records, derived refunds and contributions, shared editing, and every aggregate. Re-evaluate it after profile connections or management changes. If parents are intended to coordinate gifts for a managed child through Spending, that requires an explicit product-policy decision because it conflicts with the current recipient protections elsewhere.

### F4 · P1 · Changing an idea to "Only me" leaves its spending shared

**Who learns the surprise:** A spending partner whose access to the gift idea has been removed.

The idea editor says "Only you can see this idea, including reservations and purchases." Spending stores a `protected` value when the reservation snapshot is created. It does not consult the source item's current private visibility when deciding whether an existing record can be shared.

Reproduction:

1. Connect two spending partners and configure automatic sharing for a third recipient.
2. Create a group-shared, recipient-hidden idea and reserve it as its creator. Its plan becomes shared through the spending rule.
3. Edit the idea to "Only me."
4. The partner loses access to the item, but still receives the shared plan and its estimate through Spending.
5. A purchase request that omits `keepPrivate` inherits the plan's sharing. The diagnostic exposed a new $55 purchase after the idea became private.

There is an important UI distinction. The current purchase form recognizes a private source item and sends `keepPrivate: true`. That reduces accidental disclosure through that form, but it is not a server authorization boundary. The resulting record still inherits the stale protection value. The ledger offers "Share with partner," and the share endpoint accepts it. The diagnostic reproduced this path separately. Existing shared plans also continue changing as quantities are purchased or released.

Source locations:

- [spending.ts](../src/server/spending.ts), line 59, current visibility omitted from protection; line 155, protection captured in a snapshot; line 847, copied protection and inherited purchase sharing; `spending.share`, the same predicate permits explicit sharing.
- [SpendingPurchase.tsx](../src/client/SpendingPurchase.tsx), lines 356 and 454, the client-only mitigation.
- [Spending.tsx](../src/client/Spending.tsx), line 665, the sharing action uses the stored protection flag.
- [components.tsx](../src/client/components.tsx), line 578, the "Only me" privacy promise.

**Recommended correction:** Derive source-linked spending protection from current item privacy on every read and mutation. When an idea becomes private, remove partner access to affected source-linked plans and records under the stated policy, while preserving the payer's own history. Cover automatic sharing, explicit sharing, refunds, contributions, totals, and existing sessions. The UI should receive a server-derived sharing capability instead of treating a historical snapshot flag as authority.

## Behavior that held up

"No additional issue found" below describes the reviewed paths and executed checks, not a guarantee about every possible state.

| Route or workflow                                | Intended boundary                                                                   | Audit result                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, person pages, wish lists, gift detail      | Surprise recipients receive item content without buying activity                    | `giftView` omits reservations, purchase counts, buyer names, timestamps, and notes. Synthetic before/after responses were identical. Browser reservation flow passed.                                                                                                      |
| Joint recipients and managed profiles            | Any controller receives recipient privacy                                           | Main item access and projection use the common controller rule. Spending is the exception in F3.                                                                                                                                                                           |
| Browsing, search, filters, pagination            | Hidden gifts must not influence results or counts                                   | Item visibility is checked before result collection. Availability is withheld for Surprise recipients. Paging tests passed.                                                                                                                                                |
| Duplicate warnings                               | An inaccessible idea must not be discoverable through a match                       | Duplicate candidates are limited to visible active items. Existing privacy tests passed.                                                                                                                                                                                   |
| List privacy settings                            | Sharing locks mode, timezone, and exchange-reveal policy                            | Server locks survive unsharing. Future reveal dates can move later only. Browser lock and archive tests passed.                                                                                                                                                            |
| Group events and repeated events                 | Leadership manages settings without gaining recipient purchase access               | Event lists use the same item projection. Repeat creates fresh lists without copying activity. Domain tests passed.                                                                                                                                                        |
| Gift summaries                                   | Owner-only, after the whole selected day in the list timezone                       | Dates and ownership are checked on the server. Notes and amounts remain absent. Exchange gifts require opt-in when correctly classified. Browser summary checks passed on desktop and an emulated phone viewport. F1 can misclassify a gift before this filtering happens. |
| Independent ideas                                | Private by default; hidden ideas excluded from recipients and guardians             | Item access, imports, and creation defaults follow the intended scope. Spending transitions fail as described in F4.                                                                                                                                                       |
| Exchanges                                        | Only controlled givers' assignments; no organizer override                          | World responses filter assignments by controlled giver. Correctly tagged reservations anonymize the giver and omit purchase progress for others. F1 and F2 undermine that behavior through normal shopping steps.                                                          |
| Contributions                                    | Recipients never gain pool details; financial parties retain their own history      | Gift projection omits recipient pool details; exchange pools are rejected. Buyer/contributor history is separately authorized.                                                                                                                                             |
| Private notes and mentions                       | No recipient access; scoped exchange notes stay restricted                          | Recipient/guardian exclusion and forged mention checks passed. Note creation's changing scope is F2.                                                                                                                                                                       |
| Inbox, unread counts, notification links         | Check current access before displaying details                                      | Inbox entries and counts filter through the same eligibility check. Delivery rechecks access. Account-switch browser regression passed.                                                                                                                                    |
| External email, Telegram, SMS, push              | Private gift details remain out of previews                                         | Reviewed delivery code uses generic private-activity copy. Opted-in detailed previews are restricted to wish-list additions. Push binding, late delivery, and payload tests passed. Live providers were not contacted.                                                     |
| Friend creation, invitation, connection, archive | No surprise transfer to the connected recipient; revoked sharing does not republish | Domain and database tests cover explicit acceptance, separate entries, audience removal, and history retention. No additional disclosure found.                                                                                                                            |
| Archive, Trash, permanent deletion               | Recipients cannot infer commitments from deletion results                           | Public deletion results and Trash entries omit hidden activity. Historical financial records remain with authorized parties. Tests passed.                                                                                                                                 |
| Account export                                   | Own records rather than other people's surprise plans                               | Reviewed JSON allowlist and CSV filtering. Existing export tests passed.                                                                                                                                                                                                   |
| Photos, imports, AI discovery                    | Direct access and drafts respect the same account/audience restrictions             | Media checks attachment visibility; imports and discovery jobs check ownership; shared preferences require selected groups. Existing tests passed.                                                                                                                         |
| Authentication, retries, local storage           | No unauthorized API access or stale account data                                    | API responses use `no-store`; mutation origin checks and account-switch checks passed. Replays avoid historical private DTOs. Static service worker excludes API responses. Product-image caching is account-scoped and revalidated.                                       |
| App administration                               | Admin UI does not grant general surprise access                                     | Item/note policies still apply; job diagnostics omit gift titles and note contents. Server operators retain database access by design; the app does not promise encryption against the operator.                                                                           |

## Verification and evidence

- Existing unit/domain suite: **760 passed, 58 skipped**, across 59 passing and 7 skipped files.
- Separate PostgreSQL integration run: **30 passed** across 4 files. These include cases skipped without a test database in the first run; the counts should not be added as if all were distinct suites.
- Existing Chromium browser checks: **19 passed**, covering the main end-to-end suite, paging, retry/account-switch behavior, privacy-date locks, and gift summaries.
- Service-worker navigation and push checks: **31 passed**.
- Production build and TypeScript check passed.
- Added synthetic diagnostic: all four findings reproduced. At audit time its exit status was intentionally 1 while disclosures remained reproducible.
- Focused Chromium reproduction: **1 completed**, confirming F1 and F2 through actual assignment navigation, note submission, and reservation controls. Screenshots show another shopper reading the exchange note and the giver's real name.

Run the diagnostic without a database or external services:

```sh
npx tsx scripts/audit-surprise-privacy.ts
```

[The diagnostic command](../scripts/audit-surprise-privacy.ts) now invokes the maintained spending and exchange privacy tests. The original reproduction used a positive control for unchanged recipient responses and isolated examples for each finding. F1's domain example models the ordinary reservation payload emitted by the UI; its navigation behavior is also checked in the focused local browser reproduction.

Local, ignored evidence is under `.local/privacy-audit/`: `domain-evidence.txt`, the focused Playwright reproduction and configuration, browser response evidence, and screenshots. These are synthetic fixtures, not production records. The temporary app and database were stopped after verification.

Physical iOS/Android app switching, device notification presentation, deployed reverse proxies, and real external delivery were not exercised. The browser results use Chromium; narrow viewport checks are emulation. The existing suite's remaining skipped integration cases were not silently counted as passing.

## Fix acceptance criteria

1. Follow an exchange assignment through people, lists, and gifts at desktop and phone widths. A resulting exchange reservation must show "Exchange giver" to another shopper, omit progress/timestamps, reject contribution pools, and remain excluded from summaries when exchange reveal is off.
2. Exercise direct item purchase from Buying as well as Reserve gift. Verify a deliberate exchange choice or preserved assignment context at both entry points.
3. Post notes before reserving, while reserved, after release, and while shopping for multiple managed givers. Verify the displayed audience matches reads, mention candidates, notifications, and edits in every state.
4. Connect a giver to a guardian as spending partners. Repeat with joint recipients and profile-management changes. No protected gift details or count/total changes should reach the guardian through Spending.
5. Reserve a shared idea, change it to Only me, then purchase, edit the amount, refund, and attempt explicit sharing. Verify partner data and aggregates stay unchanged. Repeat through direct API calls without the UI's `keepPrivate` flag.
6. Keep the existing positive checks for normal Surprise lists, Transparent opt-in behavior, summary dates, history retention, and account isolation passing.

The four defects should be fixed and these cross-feature scenarios added to the ordinary regression suite before surprise privacy is signed off.

---
version: 1
slug: "src-client-groupevents-tsx"
primary_target: "src/client/GroupEvents.tsx"
related_targets: ["src/client/ListPolicyFields.tsx", "src/client/ListIndex.tsx", "src/client/Management.tsx"]
---

# Group events

- Mode: Operate. Family organizers create an occasion once; recipients add their own wishes and all group members shop.
- Extend Little Hint's established visual system and list/settings composition. No new visual identity, generated imagery, or concept tournament. Reuse system type, warm theme tokens, flat divided rows, native dialogs, and 44px controls.
- Entry points: Group events alongside personal lists and group settings. Event details begin with name, note, privacy, and leader actions, followed by recipient rows. My lists remains the active navigation destination on event routes.
- Creation uses a focused form: group, event name/note, recipient checkboxes with Select all/Clear, then shared privacy and dates. Explain that selection creates lists, while membership grants shopping access. Empty selection disables creation. Editing permits removing all participants.
- Owners appoint event leaders. Leaders manage shared settings; recipients/guardians manage gifts. Managed lists identify the recipient and link to the event; individual settings/archive controls are absent. Removed participants retain archived rows and history.
- Keep light/dark and desktop/mobile behavior consistent. Preserve form input on errors, expose busy/error states, and label development fixtures. Do not display buying-progress counts, private activity, or hidden purchase details in event management.
- Direction contract: THESIS, organize one occasion and open distinct personal lists. OWN-WORLD, incumbent Little Hint colors/type and unboxed rows. STORY, select people, create lists, add wishes, shop. FIRST VIEWPORT, event heading/actions above participant links. FORM, a precisely scoped extension of existing rows/forms; no seed applies.

- My lists shows each event once, with “Shared with:” and separate “Your wish list”, managed-profile wish-list, and Manage/View event links. Standalone lists remain a separate section.
- Optional recipient priorities are independent of shared item order. Sorting is labeled; personal collection and viewer sort preferences persist across devices. Reordering uses a Save/Cancel dialog with drag handles and keyboard/touch move buttons.
- Active, Archived, and Trash are distinct. Removing an event archives and preserves its participant lists. Permanent event deletion detaches those lists as standalone archived lists while retaining owners, sharing, privacy, and reveal policy.
- Notification counts describe processed updates and sit apart from exchange actions. The footer has one unlinked “Created by Affolder Creative” attribution.

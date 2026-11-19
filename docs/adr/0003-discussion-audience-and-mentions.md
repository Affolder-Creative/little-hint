---
status: accepted
---

# Derive mention eligibility from discussion access

The following principles were confirmed during design and approved for implementation. This is a greenfield implementation; no migration or preservation of pre-feature notes is required.

Mentions require existing access to both the item or gift idea and its discussion; tagging never grants access. Managed profiles without active accounts cannot be mentioned. This keeps notification targeting from becoming an alternate sharing mechanism.

For non-surprise content, recipients may read and participate in the entire discussion without first being mentioned. Any applicable surprise restriction excludes the recipient, and an Only me gift idea permits no mentions of other people. Gift ideas use their own visibility settings; wish-list items inherit their list's settings. Use a label that makes recipient participation clear wherever recipients can read the conversation.

Managers participate under their own access. Managing a recipient does not itself grant access to that recipient's standalone gift ideas. A manager in a selected shared group may access a hidden gift idea and its discussion as a gift giver. Wish-list co-managers retain their existing list access as defined in ADR 0002. Discussion eligibility follows the actual shared audience, including all selected groups and authorized co-managers, rather than requiring membership in a particular recipient family group.

Every actual recipient of a surprise is excluded from its discussion, including recipients who also manage another recipient. Management alone does not make someone an actual recipient. Melanie may discuss a surprise for Denny when she has independent access, but not a surprise jointly for Melanie and Denny.

This recipient exclusion also applies when someone accepts joint-recipient status or claims a managed profile. Prior authorship or mentions do not override current recipient restrictions. After a profile claim ends management authority, former managers retain discussion access only through their remaining independent permissions. These are consequences of the recipient exclusion and existing-access rules, not additional access grants.

Notes written while a discussion excludes recipients remain private from recipients when the content later becomes recipient-visible. Recipients may participate from that point forward and read the entire recipient-visible conversation. The interface must distinguish that conversation from earlier surprise discussion. This preserves the privacy under which future notes are written without requiring a migration of pre-feature notes.

New ordinary notes use the item's current visibility without a per-note privacy selector. Show the audience beside the composer and keep protected earlier notes visibly separate. Notes written while a gift idea is Only me remain author-only after sharing; sharing opens the audience for new notes rather than publishing earlier personal notes.

Special note restrictions remain stronger than general item sharing. Exchange-specific notes retain their giver-and-eligible-managers audience; author-only notes and notes awaiting privacy review remain author-only. Every reader must still have item access and satisfy applicable surprise restrictions.

Mention eligibility is checked at posting and notification delivery. Reject stale mentions with an explanation when a tagged account loses access before submission. Access loss also removes access to the discussion and its in-app notifications, and queued notifications must recheck access before delivery. Already-delivered email and push notifications cannot be recalled.

If the discussion audience changes during composition, preserve the draft and require the author to review the changed audience before posting, even when all mentions remain valid. This prevents a privately composed note from being submitted to a newly expanded audience.

## Audience exceptions and joint ideas

Gift ideas may name several recipients. A shared surprise excludes every actual
recipient; optional account exclusions override group membership. Notes capture
explicit excluded accounts and surprise-recipient identities when created. Editing
can add current restrictions but cannot remove historical ones. Restored item
access therefore permits new discussion without publishing earlier protected
notes. Connection and profile takeover remap historical recipient identities.

Recipient changes stop permanently when the first gift plan exists. This avoids
reassigning financial commitments or accidentally revealing a buyer's surprise.
Removing audience access releases unpurchased reservations and unsent pledges,
but retains purchases, payments and settlement. The implementation specification
is tracked in [issue #245](https://github.com/Affolder-Creative/little-hint/issues/245).

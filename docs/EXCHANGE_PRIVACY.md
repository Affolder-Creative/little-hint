# Exchange shopping and note privacy

Assignment links carry an exchange, giver, and recipient choice through people, lists, and gift pages. Refresh and new tabs preserve this context. Generic gift pages and direct purchase forms ask for an explicit choice when an assignment matches. Not part of an exchange remains available. The server validates the choice; stale or forged choices fail instead of becoming ordinary gifts.

Notes save the chosen audience independently of reservations. Releasing a gift does not change earlier notes or the selected context for the next note. The giver and current managers can read scoped notes only while they retain item access and are not recipients. Mention candidates, edits, inbox counts, and delivery use the same policy. Editing text does not broaden its audience.

## Existing data

Run `node dist/server/cli.js privacy-preflight` against an authorized database copy before upgrading. It reads records and prints only counts, without names, titles, or note bodies. It does not migrate, delete, or rewrite records.

Existing explicitly scoped notes and tagged reservations keep their scope. Old untagged records become review candidates only when retained assignment history indicates a possible exchange. The app preserves their contents. Unresolved notes remain visible to their authors; unresolved reservations retain anonymous availability while hiding attribution, purchase progress, spending sharing, and summary disclosure. Their owners see review controls on the gift page. A note can stay author-only, or its author can confirm the selected audience. A buyer can confirm ordinary or exchange context. Gifts with contribution history cannot be converted into exchange gifts.

Review never sends old activity again. It preserves IDs, quantities, amounts, and note text. Confirming an ordinary gift does not revive revoked spending grants. Records with no evidence of exchange ambiguity retain their behavior. Detection is limited by the available history and cannot recover an intent that was never stored.

Schema version 6 prevents older app/worker versions from interpreting these records with broader permissions. Upgrade both services together. Back up the database and uploads, rehearse the upgrade, and use a matching restore if reverting to older binaries. No data reset is required.

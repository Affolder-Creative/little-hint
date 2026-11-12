---
version: 1
slug: "src-client-forms-tsx"
primary_target: "src/client/forms.tsx"
related_targets: ["src/client/ImportDrafts.tsx", "src/client/mobile-repairs.css", "src/client/HelpfulNote.tsx", "src/client/helpful-note.css"]
---

# Gift and draft editors

- Mode: Operate. Retain the fixed heading and action footer around one scrolling content area, with the existing short-height fallback.
- Read the latest draft before opening editable fields. Hydrated saved/shop fields form the clean baseline. Opening or closing an untouched draft does not write or announce a save.
- Real edits autosave after one second. Serialize writes, coalesce newer edits, skip unchanged snapshots and update the draft and world caches. Publishing, Save for later and closing await the same save queue.
- Use one small status region in the content. Successful saves keep their confirmation; failures retain input and offer retry. Genuine revision conflicts stop automatic retries and require confirmation before Reload latest discards local edits. Discard changes and close keeps the saved draft.
- Gift-idea actions pair a filled primary button with outlined Save for later. Use an 8px gap, group on desktop and stack at full width on phones. Do not reserve empty footer feedback space. Apply safe-area padding once, accounting for the outer dialog gap.
- Preserve intentional field clears, recipient, audience, group and spending choices, late lookup results and guardian visibility rules.

- Photos use contained thumbnail rows. An outlined Make cover button or checked cover status occupies the first action row; neutral Replace and destructive Remove actions with icons share the second row. Counts reflect the deployment limit. Upload batches disable dismissal and saving; failures preserve successful photos and offer retry. Gallery changes follow the existing draft save queue.
- Helpful notes use the approved rich-text toolbar. Preserve selections during formatting and link editing, literal legacy content, 5,000-character limits and formatting-only dirty state. Match the saved note typography and wrap toolbar targets without horizontal overflow.

Lookup actions disable final saving until completion, failure, or explicit manual entry. Save for later preserves running lookup drafts; completed item lookups restore Save draft. Manual entry retires the lookup and protects local edits. Existing-record changes require discard confirmation.

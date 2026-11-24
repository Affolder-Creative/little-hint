---
version: 1
slug: "src-client-app-tsx"
primary_target: "src/client/App.tsx"
related_targets: ["src/client/Browser.tsx", "src/client/Buying.tsx", "src/client/components.tsx", "src/client/GiftContext.tsx", "src/client/gift-context.css"]
---

# Home and gifting collections

- Mode: Operate. Keep the established warm palette, flat rows and gift grids.
- Home is gifting first: eligible active published wishes and ideas for other recipients lead. When that collection is empty before any user filters, show the viewer’s and their managed profiles’ wishes. A filtered-empty result never switches collections.
- The server supplies the feed mode for paged worlds. Gifting copy is “A few hints for your favorite people.” Own-wishes fallback copy is “A little hint about what you would love.”
- Keep one greeting and description with View your people beside it, or My lists for a solo account. Omit the redundant collection heading; gift cards use the next heading level below the greeting.
- People introduces the directory with “Find your people, browse their wish lists, and keep gift ideas for them.”
- Buying titles and photos link to the same detail destination. Private ideas combine Only me and an info icon in one 44px InfoHelp trigger with a 6px gap. More actions keeps outline icons and separates destructive cancellation at the end.
- People filters retain selected tags across touch activation, dismissal and history navigation. Input and portaled options form one interaction boundary.

- Buying combines purchased quantities and standalone Spending purchases once. Purchased arrival filters and in-hand counts remain buyer-private, using unboxed text filters and supporting metadata. Partial purchases remain in Needs buying and Purchased.

- Saved-gift grids use the app-wide Compact cards default or Large photos alternative. Compact cards have a thin border, 12px corners, no shadow, and square photos left of the details. Two columns require at least 880px collection content width; narrower collections use one. Card padding/gaps step from 12px to 10px at 650px. Large photos retains the unboxed image-above-details grid. Compact missing-photo frames show an icon only with an accessible name; Large photos retains the visible fallback label. Compact card rows and height stay automatic to avoid clipping enlarged text.
- Cards and gift details share GiftContext: On with a source wish-list link, or Not on a wish list for ideas. A creator-only Your spending list caption is separate from the source and never implies publication or sharing.
- Surprise uses eye-off, recipient-visible states use eye, and Only me uses lock. Card labels hide visually on phones while the help trigger retains accessible text and a 44px target. Both browsing-card layouts omit repeated privacy sentences. Help opens on mouse hover, tap, click or keyboard activation; source and spending captions remain visible. Detail pages retain the full explanation. Drafts show their unpublished state instead.
- Known card prices and ranges use weight 600, 18px on desktop and 16px at 650px and below. Compact titles wrap fully; Large photos retains its phone clamp. Source links and privacy help remain independently operable beside the stretched detail link.

- Compact thumbnails use a 26% column bounded between 72px and 104px, retaining the 64px/25% phone column. On desktop, the recipient line leaves 4px before the title, while title-to-context and context-to-following-content gaps are 8px; price follows the content without bottom anchoring. Desktop compact and Large photos card privacy help keeps a 44px target with -8px block margins for a 28px visible row. An 8px gap between wrapped context rows prevents its hit area from overlapping the source link; single-line spacing stays unchanged. Hover/open fill is confined to its padded 6px-radius inner label.

- Compact phone cards at 650px and below leave 8px after the recipient, then 4px after the title and context. Full-width context with a privacy help trigger uses a flexible source column and a dedicated 44px help column with a 4px gap and no row gap. A 24px centered help wrapper contains the unchanged 44px target with zero block margin; the target extends 10px above and below in its right gutter. Draft context retains its wrapping flex layout. Title, price metadata and spending captions reserve 48px to the right. Desktop spacing stays unchanged.

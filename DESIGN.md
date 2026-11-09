---
name: Little Hint
description: Gift ideas, shared thoughtfully.
colors:
  bg: "#fff8f0"
  paper: "#fffdf9"
  admin-panel: "#faeee5"
  text: "#2b201d"
  muted: "#746057"
  border: "#e6d9cf"
  control-border: "#93796c"
  accent: "#aa4d37"
  on-accent: "#fff8f0"
  soft: "#f4e4da"
  green: "#486348"
  error: "#9f3327"
  dark-bg: "#2b201d"
  dark-paper: "#342722"
  dark-admin-panel: "#342722"
  dark-text: "#fff8f0"
  dark-muted: "#cbb6aa"
  dark-border: "#59453b"
  dark-control-border: "#a28677"
  dark-accent: "#f1bead"
  dark-on-accent: "#2b201d"
  dark-soft: "#49332b"
  dark-green: "#bdd0aa"
  dark-error: "#ffb1a2"
  gift-placeholder: "#efe7dc"
  gift-placeholder-ink: "#8b7164"
  gift-placeholder-peach: "#f0e2d7"
  gift-placeholder-sage: "#e8eadd"
  gift-placeholder-sage-ink: "#677358"
  gift-placeholder-rose: "#eee3e0"
  gift-placeholder-rose-ink: "#906b68"
  available: "#e9eddf"
  avatar-peach: "#ead5c7"
  avatar-peach-ink: "#754e3e"
  avatar-sage: "#dfe5d4"
  avatar-sage-ink: "#536149"
  avatar-sand: "#eee0d4"
  avatar-sand-ink: "#805841"
  avatar-plum: "#e5dbe6"
  avatar-plum-ink: "#6e526f"
  dark-gift-placeholder: "#43372e"
  dark-gift-placeholder-ink: "#ceb9a6"
  dark-gift-placeholder-peach: "#50372e"
  dark-gift-placeholder-sage: "#373d30"
  dark-gift-placeholder-rose: "#44333c"
  dark-available: "#36412f"
  dark-available-ink: "#cfddbe"
  dialog-shadow: "rgba(34, 20, 13, 0.25)"
  dialog-backdrop: "rgba(35, 25, 20, 0.45)"
  toast-shadow: "rgba(0, 0, 0, 0.16)"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 'clamp(28px, 3vw, 36px)'
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: '-0.035em'
  section:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: '22px'
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  title:
    fontSize: '17px'
    fontWeight: 600
    lineHeight: 1.35
  gift-title:
    fontSize: '16px'
    fontWeight: 550
    lineHeight: 1.4
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    lineHeight: 1.6
  label:
    fontSize: '13px'
    fontWeight: 550
  button:
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.25
  filter-label:
    fontSize: '14px'
    fontWeight: 550
  supporting:
    fontSize: '14px'
    lineHeight: 1.5
  search-placeholder:
    fontSize: '13px'
  caption:
    fontSize: "12px"
  compact-label:
    fontSize: "11px"
  avatar-initial:
    fontSize: "15px"
  avatar-small-initial:
    fontSize: "10px"
  avatar-phone-initial:
    fontSize: "8px"
  row-title:
    fontSize: "18px"
  event-context:
    fontSize: '18px'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 'normal'
  event-description:
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.6
  list-title:
    fontSize: "19px"
  panel-title:
    fontSize: "20px"
  section-phone:
    fontSize: "21px"
  empty-title:
    fontSize: "25px"
  empty-title-phone:
    fontSize: "23px"
  detail-title:
    fontSize: "34px"
  detail-title-phone:
    fontSize: "29px"
  page-title-tablet:
    fontSize: "32px"
  page-title-phone:
    fontSize: "30px"
  login-display:
    fontSize: "clamp(36px, 4.5vw, 56px)"
  login-display-tablet:
    fontSize: "40px"
  login-title:
    fontSize: "26px"
  login-code:
    fontSize: "24px"
rounded:
  badge: '4px'
  control: '8px'
  panel: '12px'
  image: '14px'
  dialog: '16px'
  avatar: '50%'
  toast: "10px"
  install-icon: "11px"
spacing:
  metadata: "4px"
  section-wide: "32px"
  compact: '8px'
  small: '12px'
  medium: '16px'
  large: '20px'
  section: '24px'
  wide: '28px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '12px 18px'
  button-secondary:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.text}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '12px 18px'
  button-text:
    textColor: '{colors.accent}'
    padding: '8px 0'
  button-icon:
    rounded: '{rounded.control}'
    padding: '10px'
  field:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '11px 12px'
  nav-active:
    backgroundColor: '{colors.soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '13px 15px'
  nav-mobile:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
  status:
    backgroundColor: '{colors.soft}'
    textColor: '{colors.muted}'
    rounded: '{rounded.badge}'
    padding: '4px 6px'
  gift-card:
    textColor: '{colors.text}'
  privacy:
    textColor: '{colors.muted}'
    padding: '6px 8px'
  admin-panel:
    backgroundColor: '{colors.admin-panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.panel}'
    padding: '20px'
  admin-panel-phone:
    padding: '16px'
  photo-frame:
    backgroundColor: '{colors.paper}'
    rounded: "{rounded.image}"
    padding: '10px'
  info-help:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    rounded: '{rounded.panel}'
    padding: "12px"
    width: "20rem"
  toast:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.toast}"
    padding: "14px 20px"
---

# Design System: Little Hint

## Overview

**Creative North Star: "A little thought. A lovely surprise."**

Little Hint is a calm place to coordinate gifts for people you know. Recipient names, gift details, prices, and availability lead. Warm paper backgrounds, quiet dividers, and open rows give those details room.

The approved heart-tag artwork carries the brand. Its outlined Fraunces lettering remains an image asset; the interface uses the established system sans stack. Light and dark themes share the same hierarchy and shapes.

**Key Characteristics:**

- Approved heart-tag artwork and outlined lettering.
- Ivory and umber neutrals with sienna actions and blush selection fills.
- Flat gift cards with recipient details directly below the image.
- Desktop sidebar and mobile bottom navigation.

## Colors

The palette uses warm neutrals for reading and sienna for actions. The frontmatter records the theme custom properties and component literals in `src/client/style.css`; `dark-` entries are the matching overrides under the dark theme selector. Component color purposes in the sidecar identify their selectors. Placeholder and avatar colors stay local to those components; shadow and backdrop colors stay local to their effects.

### Primary

Sienna `accent` identifies primary actions, text actions, selected tabs, and keyboard focus. `on-accent` provides their text color. Dark mode replaces this pair with light blush on umber.

### Secondary

Blush `soft` supports active navigation, notices, invitations, and installation guidance. `green` and `error` are semantic feedback colors, with readable dark-theme counterparts. Availability badges use their own muted green fill and text, recorded as `available`, `dark-available`, and `dark-available-ink`. The light badge text uses `green`.

### Neutral

Ivory `bg` is the page background; `paper` is the slightly lighter sidebar, input, and dialog background. Umber `text` carries the reading hierarchy. `muted` handles supporting copy and `border` separates rows and controls. Dark mode uses umber backgrounds, ivory text, and lighter muted text.

Editable fields use `control-border`, a stronger warm neutral with at least 3:1 contrast against paper, page, and soft backgrounds in both themes. Decorative dividers retain `border`.

**The semantic color rule.** Use the theme variables for interface text, controls, and backgrounds so light and dark modes preserve their roles.

## Typography

Component and responsive type roles record existing CSS sizes. Their selector scopes live in `extensions.typographyMeta` in the sidecar. These are local exceptions, not interchangeable steps for new body copy. In particular, the 8px avatar initials accompany a readable recipient name.

The approved logo has outlined Fraunces artwork. It does not require loading a web font. All interface text uses the system sans stack in the frontmatter, including page headings; this is the user-approved identity.

Page headings use a responsive size with restrained weight and tight tracking. Section headings step down to 22px; ordinary component titles use 17px, and gift titles use 16px. Paragraphs use a 1.6 line height. Common form labels use 13px and medium weight. Sort & filter labels use the filter-label role; checkbox labels and action-menu entries use the button size. Search placeholders use their own smaller role while touch input text remains at least 16px. No separate mono family is established.

At 900px and below, page headings are 32px; at 650px and below, they are 30px. Gift titles become 15px and then 14px at the same breakpoints. Supporting description widths are capped at 65ch on desktop and 40ch on narrow screens. Login-specific display sizes are local composition choices, not a general type role.

**The artwork rule.** Use the supplied logo and symbol assets. Do not recreate their lettering with live text.

## Layout

The desktop shell has a fixed 242px sidebar and matching main offset. Content is centered within a 1400px maximum width, with 44px horizontal padding. At 1200px and below, the sidebar narrows to 210px and content padding to 28px. At 900px and below, the sidebar gives way to an opaque sticky top logo bar and fixed bottom navigation. The header adds the top safe-area inset to its 78px content height, or 76px at phone widths, and respects landscape side insets. The navigation includes bottom and side safe-area padding. Content padding becomes 24px, then 20px at 650px and below.

The shell reserves the measured navigation height plus 16px below the footer. A border-box ResizeObserver keeps this clearance accurate when safe areas, viewport width, or text size change. Toasts sit 16px above navigation; update notices sit directly above it. Document scroll padding keeps focused content clear of the sticky header and bottom navigation. Desktop navigation needs no bottom reservation.

New route and settings-section navigation starts at the top, including taps on the fixed mobile navigation. Back and Forward restore the position saved for that history entry. Note and exchange links scroll to and focus their targets. Restoration waits for delayed content, including busy draft and item collections even when the page is already tall enough, for up to ten seconds, then stops; pointer, touch, wheel or scroll-key input cancels a pending restoration. Positions are scoped to the signed-in account and browser tab, retained for at most 100 entries, and cleared with personal device data. Reloads restore the saved entry after content becomes available.

Buying opens on Needs buying, including partially purchased reservations. Purchased contains gifts whose reserved quantities are fully purchased; All combines both. Status controls show gift counts and wrap on narrow screens. Contributions and cancelled history remain outside these filters. When an update removes a row from the current view, keyboard focus returns to the selected status control, or main content if no active reservations remain.

Home, People, My lists, Buying, and Exchanges are the persistent navigation destinations. Settings and private groups remain together. The first home view pairs the logo and clear navigation with welcome copy and gift browsing controls. Optional gift-preference prompts sit directly below the Home greeting, ahead of installation prompts, invitations, and gift browsing or the first-list action. Keep the existing warm card and wrap its actions without overflow on narrow screens. List detail titles occupy a full row; Add item leads the action row, with settings, following, archive, and Trash grouped in the list action menu for managers. Empty collections omit sorting and filtering; archived-only and filtered collections retain the controls needed to recover their items. Person pages keep compact, wrapping list links and source-list captions. Empty preference summaries occupy no space; owners and guardians reach preferences through Edit profile or the visible Gift preferences shortcut.

Gift browsing uses three equal columns, then two at 650px and below. Cards share image and content row heights so mixed photo and no-photo rows align. A row with a real photo keeps its full image area; rows containing only missing photos stay compact. Reading and keyboard order remain unchanged. Desktop gaps are 28px vertically and 22px horizontally; narrow-screen gaps are 28px and 15px. People use two columns before becoming a single list. Gift details use two columns before stacking on narrow screens. Recurring gaps and padding use the spacing steps in frontmatter, alongside local layout measurements.

Search stays visible beside a labeled Sort & filter button, wrapping as needed on the narrowest screens. Gift searches use Search items or Search gift ideas, with a smaller placeholder and an accessible description of name, person, and tag matching. Sorting, people, tags, availability, group, and exchange-status choices use a focused dialog and apply immediately. People uses a searchable multiselect combobox with up to twenty matching options and removable selected-person chips in mixed-recipient item views, omitted on person pages and single-recipient collections. Home also offers All items, Wishes, and Gift ideas as an Item type filter. No selection means everyone; selecting several people matches any of them, including joint gifts. Choices come from authorized items before filtering. Active choices remain summarized beside results, with People counted as one filter. Clear filters preserves search and saved sorting. Per-entry filter state survives Back, Forward, and reload. Fresh active-grid visits enable Available to give. Search temporarily includes taken-care-of gifts, and clearing it restores the availability choice. Archived views include all items. Hidden availability never removes an item from a surprise recipient’s view. Profile avatars keep their fixed size while adjacent settings copy can grow.

Page titles sit 8px above their descriptions. Headers leave 24px before content on desktop and 20px on mobile; filters leave 20px before gift grids. Wish-list guidance leaves 16px below the header actions. Section breaks use 32px on desktop and 24px on mobile. Security and administration subheadings have explicit space above them, and gift quantity controls leave 16px before the reservation action. Mobile gift recipients use 12px text; tags, status labels, and navigation labels use at least 11px.

Paragraph spacing follows content roles across app pages and dialogs. Dense title-and-metadata pairs use the metadata step; headings and closely related explanations use compact spacing. Ordinary prose uses the small step, and content before controls uses medium spacing. The corresponding CSS properties are --space-metadata, --space-related, --space-prose, --space-controls, and --space-section. Form groups use the controls step; adjacent explanations use the related step. Explicit text stacks reset child margins and own the gap. Final paragraphs have no trailing space where the container owns separation. Hero copy and card-specific rows retain their established composition.

Gift details group the recipient, title, status, price, and quantity with the prose step. Phones place the photo 16px above the details, and the back link leaves 8px below its touch target. Reservation, Gift plans, and Private notes use matching section headings, reduced to the section-phone role on phones. When an exchange or privacy-review context is relevant, Buying for sits with reservation controls, below the explanation and above quantity. Its field is bounded to 32rem and explains the exchange-versus-separate-gift choice. Archived and recipient views retain context access beside the gift actions. Reservation explanations and private-note guidance use the supporting role, capped at 65ch. Keep their heading-to-copy and paragraph gaps compact; do not compound the privacy-note margin with the section heading margin.

### Collection pagination

Item grids and active gift plans show 24 entries per page. A quiet result count and Previous/Next controls sit above and below the collection. The count uses 14px text; controls reuse secondary buttons and their 44px minimum touch targets. Controls wrap on narrow screens, with the button group spanning the available width. A single page retains its result count without navigation buttons.

Search and filter controls stay mounted while results refresh. Changing a filter starts on page one. Explicit page navigation focuses the results region and brings it below the sticky header; background updates preserve focus and position. Back, Forward, and reload retain the page and existing browse choices. Loading and failed reads remain distinct from empty results, with a Retry action for failures.

### Retained gift plans

Buying links product names to the same detail page as their photos. Only me and its info icon form one 44px help button with a 6px gap. Either opens the existing privacy explanation in the shared native popover. Secondary action menus use consistent outline icons and place destructive cancellation last, separated by a divider. Buying keeps wish availability separate from purchase status. Private detail sections use open rows, existing text actions and a 65ch prose measure. Review controls have the standard prose spacing before payment information. Return rows distinguish money sent from confirmed receipt in text; they reuse existing forms, action menus, and light/dark tokens.

### Spending views

Buying contains the optional spending view. Personal and partner views use the established tabs. Person and occasion selectors lead; less frequent wishlist and period filters sit in More filters. Spent and Still planning use tabular figures, with estimates and missing amounts labeled in text. Budgets appear only after creation and distinguish the balance after purchases from the balance after planned gifts. The progress meter uses the existing accent and soft colors, with text carrying every amount.

Purchase history uses open rows and quiet dividers. Amounts sit beside gift details on desktop and above a grouped action row on phones. Sharing labels sit beside gift details and in purchase forms before saving. Joint-edit history expands inside the row. Spending settings reuse existing fields, checkboxes, sections, and buttons. No new palette, font, shadow, or navigation destination is introduced.

## Elevation & Depth

Ordinary content is flat. Paper tones and thin borders distinguish controls, navigation, and groups of information. Dialogs and transient toasts use soft shadows; the dialog also dims the page with a translucent backdrop. Exact shadow and backdrop values live in the sidecar.

**The flat content rule.** Gift cards and ordinary list rows have no shadow. Reserve elevation for dialogs and transient messages.

## Shapes

Controls have gently rounded 8px corners. Status labels and tags use small 4px corners. Repeated notice panels use 12px corners, gift image areas use the 14px root radius, and dialogs use 16px corners. Mobile gift images use 12px corners. Avatars are circles with initials and muted color variations.

Borders are generally a single pixel in the theme border color. The gift-image container clips its contents; product images use `object-fit: contain` with internal padding. The approved heart-tag silhouette belongs to the brand artwork and empty states.

## Components

### Buttons

Primary buttons use the accent pair, medium-bold 14px text, and 12px by 18px padding. Secondary buttons use paper, text, and a border. Both have 44px minimum hit dimensions and allow long labels to wrap within the available width. Text actions, back links, exchange assignment links, and update actions also retain at least 44px hit dimensions. Primary and secondary buttons dim slightly on hover. Text buttons use accent text without an underline on hover; install-panel text actions use the main text color. Icon buttons use a soft fill on hover.

Keyboard focus is a 3px accent outline with a 3px offset. Disabled buttons reduce opacity and use the unavailable cursor. Small button variants keep the 44px minimum height. Compact mobile header and update controls retain the same 44px minimum hit dimensions.

### Chips

Availability labels use text as well as color. Available gifts use a muted green fill; taken-care-of gifts use the soft theme fill; an owner's list membership uses a quiet text treatment. Tags use an outline and compact corners. These are informative labels, not decorative counters.

### Cards / Containers

Gift cards are unboxed links. A contained image or labeled fallback leads, followed by the explicit Wish or Gift idea type with the recipient, then title, price, privacy, and availability. Real photos share the theme paper background and 10px internal padding. Only missing-photo placeholders retain the tag-based warm color variations. Grid cards omit tags. Mobile titles clamp to two lines; full titles remain accessible and appear on gift details. Price sits above a wrapping badge group on phones; desktop metadata aligns in one compact group. The title underlines on hover. Actual images use a 1.13 aspect ratio on desktop and become square on narrow screens. Missing or failed photos use a compact 32px icon and in-flow label with an 80px minimum area that grows for enlarged text. Desktop gift details give the no-photo area a narrow 144px column beside the gift information; phones stack it above the information with a 96px minimum height. Actual photos retain their full detail layout. Replacing a failed image URL restores the photo. People, lists, purchases, and settings use open rows with bottom dividers. Invitations and installation prompts use soft rounded panels.

### Item photo galleries

Cards keep their existing two-row composition and show a quiet photo-count label over the lower-right corner of the cover only when several photos exist. The label uses paper and text colors, caption type, and badge corners. Detail galleries retain the square contained-photo frame. Previous and Next buttons flank a centered photo counter below it, with 44px targets, visible focus, and disabled endpoints. Swipe navigation preserves vertical scrolling. There is no automatic rotation or added motion. Single-photo items keep their existing layout.

The editor groups its photo count, Add photos control, feedback, and thumbnail rows inside More details. Each row uses an 80px contained thumbnail with control-radius corners, followed by wrapping cover, replacement, and removal actions. Rows have 16px spacing; phone actions wrap without stretching the dialog. Use existing text actions and semantic colors in both themes. Uploading disables saving and dismissal until the batch finishes. Failed uploads retain successful photos and offer Retry failed uploads. Cover changes and removals participate in unsaved-change protection.

### Saved wish-list drafts

Saved drafts use the existing compact divided draft rows, 15px medium titles,
muted destination labels, and wrapping 44px action targets. Keep them in a
separate Saved drafts section in My lists and the destination list. Loading and
failure states retain a retry path; empty sections disappear. Unfinished product
lookups retain their own heading and creator-only explanation.

The item form places its primary Add to wish list or Save changes action before
the secondary Save draft or Publish action in both reading and keyboard order.
Enter saves edits without publishing. A full-width audience note sits above the
paired actions and states guardian access where applicable. Save draft and Publish
use the existing outlined secondary button. Actions align right on desktop and
stack at full width on phones. The fixed dialog footer remains intact. Archived
drafts disable Publish. Wish-list imports show automatic-save guidance and a
save/error feedback in the form content after a real edit; closing saves unfinished
lookup progress. Their footer contains only the primary action and Save draft.
Gift-idea imports pair the primary action with an outlined Save for later button.
Untouched draft openings have no save message or reserved feedback space.
No new color, typography, spacing, or elevation token is introduced.

### Collection actions

List and event management menus have visible List actions and Event actions labels.
Event metadata and privacy form one heading group. On wide screens, participant-list links and Event actions sit beside that group, centered vertically. Manage event is the first menu destination, and the event title also opens the event. View event remains visible for viewers who cannot manage it. At 1100px and below, actions wrap immediately beneath the heading; at 650px and below, they align with the row's left edge. Event rows use 16px vertical padding and 14px action labels. List and event detail privacy uses one button combining the existing badge and an information icon. Collection-row badges remain passive. Menu rows are borderless and retain visible keyboard focus.

Event wish lists stay nested beside their event. When the selected Active or Archived view contains an editable event list, the lower collection is labeled Other wish lists. Its empty state is a short sentence pointing to the event lists above. Without editable event lists, retain Your lists and the existing first-list empty state. Lists from unavailable events remain accessible in the lower collection.

Private product-import drafts use compact divided rows beside their destination list and in My lists. Titles use 15px medium text and open the external product link in a new tab, with an inline external-link icon and underline on hover. Status text names Finding details, Ready to review, or Needs details. Working dots animate within a fixed-width slot and remain static for reduced motion. Ready status uses a green check and a soft-filled Review and add action; Needs details uses an accent help icon and Add details, with Try again available for failed lookups. A slow lookup offers Save draft and continue after 15 seconds; fields stay editable. Closing saves the latest edits before dismissing. Drafts remain owner-only until Review and add completes.

### Inputs / Fields

Fields have a paper background, text color, thin border, 8px corners, and a 44px minimum height. Visible labels and optional hints stay with their inputs. Search adds a leading icon and transparent fill. Forms show errors in text; busy submission disables the fieldset and changes the action label. Changed dialogs require an explicit discard decision before closing, including departures to gift discovery and arrow or drag reordering. Returning entries to their original order clears the reorder warning. Saving keeps dismissal disabled. First sharing uses a focused review of audience and visibility while preserving editable form values. The global focus outline applies to inputs, selects, and textareas. Single-column form grids use shrinkable tracks; two-column rows use equal shrinkable tracks. Fields and native date inputs can shrink to their container width. Dialogs scroll vertically, with horizontal containment after controls have been sized to fit. Keep the native date picker and 16px phone input text.

Exchange setup keeps household avoidance, individual exclusions, and previous-exchange preferences in a Matching rules disclosure. Its summary always states the current household policy, blocked-match count, and selected previous exchange. New exchanges start collapsed; editing opens the rules. Both directions adds the two one-way exclusions without duplicates, and each direction remains independently removable. Person selectors stack on phones. The existing review before saving and drawing remains in place.

### Navigation

Desktop navigation combines outlined SVG icons with labels. Muted inactive links gain stronger text and a subtle background on hover; active links use soft fill. Mobile navigation uses five equal-width touch targets, keeps icons and labels together, and marks the active destination with accent text. Enlarged labels wrap within their links instead of overlapping adjacent destinations. Theme and settings actions remain in the opaque sticky top bar on mobile. Header actions stay on one row while the logo can shrink on narrow screens. A keyboard skip link reaches the main content.

Person pages keep all wish-list items together and show compact, wrapping links to accessible active lists above the filters, including lists with no items. On these pages, gift cards show their source list beneath the title as plain text. List navigation stays inside the wishes tab; gift ideas keep their separate view.

Family-group settings keep the wrapping selected-group name and the viewer’s role together above Members, Households, and Events. A group selector appears only when there is more than one group. Phones retain the Settings introduction on this section with tighter header spacing; first-time guidance remains when no groups exist. Pending invitations and ownership requests remain visible before the group controls.

### Private gift ideas

Givers viewing an active wish list can choose Add gift idea. Ideas remain saved
for a person rather than attached to that wish list. Joint lists require an
explicit recipient choice. Links to saved ideas use `/people/:id?tab=ideas`,
which preserves the selected tab across reloads and browser navigation.

The idea form puts Who can see this idea? before product entry and defaults new
ideas to Only me. Existing sharing choices remain editable. A lock with Only me
identifies private ideas on cards, detail pages, and Buying entries. Reservation
and purchase guidance explains that the idea and its buying activity stay
visible only to its creator. Wish-list item visibility does not use this badge. Group the audience selector and its explanation using compact spacing, with medium spacing before product entry. An unavailable discovery action occupies no layout space. Saved-idea links use accent text, a persistent underline, an arrow, and a 44px touch target.

Product photo loading preserves the image area and contains the product. Visible thumbnails load promptly; detail photos retain the thumbnail until the larger image decodes.

### Friend planning

Your people keeps Add a friend separate from Managed profile. The name-only
creation dialog uses the existing labeled field and fixed action pattern. Friend
pages lead with Add gift idea. Planning status uses a small icon and 14px semibold
text with a muted explanation beneath it. Invite to connect is the visible
secondary action; the quieter Friend actions menu holds Manage friend and a
separated Archive friend action. Archived entries offer Restore friend directly.
Controls wrap on phones without competing with the page's main gift action.
Shared entries use the same
open rows and quiet dividers as the rest of the app. Multiple connected planning
entries remain visibly distinct in their management section.

Manage friend combines the name and group checkboxes in one form. Changing the
audience opens a focused review that names the selected groups, states that
private ideas stay private, and explains what removing a group revokes. A group
empty state links to family-group settings while keeping private planning usable.
Connection invitations explain verified sign-in and explicit acceptance. Pending
requests show the email, expiry, share-link control, and cancellation action.
Archive and restore use the existing confirmation dialog; restoration copy says
that the entry starts private.

### Profiles and invitation rows

Profile settings keep the avatar fixed, the name and account status together, and related actions in one wrapping group. On screens up to 650px, actions move beneath the name. Family-group members keep a compact ellipsis action menu beside the name at every width. Long names wrap within their text column. The menu groups Transfer ownership and a separated destructive Remove action with outline icons; its confirmation distinguishes group access from account deletion.

Invitation rows place email, status, and expiration together, followed by Share sign-in link and Cancel invitation in a separate action group. Use a flexible text column and an intrinsic action column on wider screens. At 650px and below, the action group moves below the details, with controls sharing available width or stacking at their normal word boundaries. Emails may wrap anywhere; button labels must not break letter by letter. Rows use 20px vertical padding and a 16px gap; action groups use a 12px gap.

The profile editor uses one action row per tab, with the primary Save action first and outlined Done immediately after it. Keep both drafts mounted, retain independent save states, and protect unsaved changes when dismissing either tab.

Managed-profile Managers uses the title role above smaller field labels, a top divider and 24px separation. Family-group sharing keeps the title role, with a single 24px break before its heading, 12px before the checkbox row, and 8px between the controls and explanation. Its native legend and content wrapper avoid compounded fieldset spacing. Find users and Find family groups use the shared multiselect combobox, with results appearing after typing and removable selected tags below the input. The owner remains visible and cannot be removed. Transfer ownership is an outlined disclosure with a chevron; its expanded fields use 20px gaps. Managed-profile sharing retains its labeled enable checkbox. Explain profile discovery, event eligibility, and new-list defaults beside the control. Existing list audiences and private gift ideas require their own explicit sharing actions.

First-sign-in name setup uses the approved logo, one heading, given-name and family-name fields, and one primary continue action. Its content is capped at 440px with 20px side insets. The administrator directory starts with search guidance and no results. After a nonblank query, compact divided matches appear in pages of 24; selecting one replaces the matches with a focused identity and management area plus Back to results. Account deletion opens a separate review with responsibilities, data choices, and exact typed confirmation.

### Administration

The new-account spending default reuses the existing checkbox and independent
save/discard form. Its explanation states when the default applies and preserves
personal choice. Personal spending views show a quiet explanation with a settings
link when tracking was enabled at signup. Use existing spacing, typography, and
theme colors.

Sign-in & security groups its passkey heading, supporting explanation and Add a passkey action with 12px gaps. Saved passkeys sit 16px below the introduction in borderless rows with 8px gaps. Each name wraps beside a 44px ellipsis menu. Rename uses a pencil icon; Remove uses a trash icon and destructive text after a menu divider. Loading, empty and retry states remain inside this section.

Administration contains App settings, This month's usage, Service status, and Background jobs. Family-group creation, automatic product photos, device photo caching, and photo prefetching are editable, with optional locking ENV overrides. All service credentials, providers, models, limits, and AI availability are deployment-only. Service status reports configuration presence, not verified connectivity. When AI_ENABLED is false, omit AI service rows, AI usage groups, and AI-specific explanatory copy even when history exists. Retain other disabled services’ current-month usage with Currently off; omit sections with only prior-month or skipped SMS history. Preserve notification retries, failed shop lookups, and the note that backup status is unavailable.

Related administration controls share warm beige panels (`#faeee5`) slightly darker than the page in light mode, retaining the paper background in dark mode. Panels have panel-radius corners and no shadow. Panels use 20px padding, reduced to 16px at 650px and below, and 24px separation. Their headings use the panel-title size; internal headings use 17px. Keep non-AI service diagnostics visible when AI is disabled; omit the monthly usage panel when no service qualifies. Service status uses flat divided rows with readable capability names and configuration status. Disabled fields retain full opacity, muted text, the page background, and a decorative border.

Preference groups use a single divider with 24px of space on each side. Service and job rows have 16px vertical padding and top dividers only; the last row ends at the panel inset without an extra rule or bottom padding. Status aligns with the first line of its label and stacks below the description at 360px and narrower. Panel introductions leave 16px before the next block; final paragraphs do not add trailing space. Photo explanations use 8px gaps. App settings have separate family-group and product-photo forms, each with its own save and discard actions and inline status. Photo rows use 16px gaps; preloading is indented 24px beneath caching. When caching is off, preloading appears unchecked and disabled while its previous choice is retained. Re-enabling caching restores that choice. Scope is explained once at the panel heading. Only changed, editable values are submitted; photo changes commit together. Usage groups leave 16px after their top divider and 8px below the final disclosure, whose 44px target supplies the remaining optical breathing room.

Family-group creation is an app-wide choice with Everyone signed in and Administrators only options. Environment overrides show a readable locked value. Follow sits outside group navigation with a 32px gap, wrapping onto its own row when needed.

AI gift suggestion mode, limits, and model are ENV-only. The service summary describes availability and allowances without configuration fields. Monthly usage uses flat divided groups for gift suggestions, product-detail AI, and paid shop lookups. Compact definition lists pair 13px labels with 18px tabular counts; token/model and estimate details expand on demand. Never equate missing usage or unknown costs with zero. Enabled services can show an empty month; disabled services with activity remain visible unless the master AI switch hides them.

### Attribution

Everyday pages have no attribution footer or bottom divider. The About story uses 15px body text within 62ch, followed by a theme-aware handwritten SVG sign-off traced from Kyle’s selected screenshot, with a matching dash and accessible text. Its compact 76px width preserves the signature’s original proportions. Settings → About
contains the approved logo, tagline, version, and readable Created by Affolder
Creative credit. The app-rendered loading screen carries a quieter credit near
the bottom, outside the loading status announcement and above mobile safe areas.

### Privacy and feedback

Privacy badges combine a lock or eye SVG with Keep it a surprise or See the plans. At 650px and below, the surprise badge displays the lock and Surprise, retaining Keep it a surprise as its sole screen-reader label. Privacy choices and explanations always retain the full wording; See the plans is unchanged. Decorative badge icons are hidden from assistive technology. Native modal dialogs have a sticky title and close control. Long titles wrap within the space beside the close control, including with enlarged text. Closing restores keyboard focus to the invoking control; if that control disappears, focus moves to the main content unless the next view has already chosen a focus target. Returning from a sharing review focuses the first visible editable field and preserves the entered values. New lists and events require an explicit Keep it a surprise or See the plans choice. Optional archive and reveal dates are collapsed until needed. Reveal-date guidance applies to all lists; the exchange checkbox clearly adds secret exchange purchases and giver names to the summary. Labels keep their help text accessible through described-by relationships. Empty states reuse the approved heart tag with a heading, explanation, and optional action. The artwork follows the active theme. Page-level missing states use an h1 and a descriptive browser title; empty sections keep an h2. Installation guidance uses the approved app icon and normal action controls. Reduced-motion preference disables animations and transitions; normal motion is limited to a loading spinner and a brief toast arrival.

### Sign-in

The landing page keeps the approved artwork at 240px wide on desktop and 190px on phones. Its headline is capped at 56px on desktop and 34px on phones. Code entry is a distinct step with a prominent numeric field, expiry guidance, and separate resend and change-email actions. Controls remain at least 44px high.

### Transactional email

Transactional emails use a 560px maximum-width, table-based layout with inline styles, the embedded 180px horizontal logo, a 26px heading, and a warm paper panel. Sign-in codes are selectable 32px text. Invitations and updates use a single action; previews remain generic unless wish-list details are explicitly enabled for email. Plain-text alternatives carry the same information.

### Brand assets

Browser favicons use the approved micro tag without a surrounding tile. The tag is sienna `#AA4D37` in light mode and blush `#F1BEAD` in dark mode; the heart is a transparent cutout. SVG and ICO links follow the app appearance setting, with a system-adaptive SVG before the app loads. Installed and Apple touch icons retain their platform-safe tiles. Regenerate favicon exports with `node scripts/build-favicons.mjs`.

### Optional fields and settings

Item and gift-idea editors use a single form with an optional product link,
item name, destination, and More details disclosure. Keep lookup status, recovery,
and warnings beside the link. Successful imports show a compact contained 64px
photo, shop, and current editable price. Lookup completion never opens optional
fields or overwrites manual edits. New entries and import drafts start collapsed;
existing items and recovered offline drafts start expanded. The disclosure
summarizes populated fields and reveals invalid controls before focusing them.

The dialog heading and action footer stay fixed around one scrollable content
area. Content uses 24px padding, reduced to 20px vertically and 18px horizontally
on phones. The footer has a top divider, 16px vertical padding, and safe-area
clearance. The primary action aligns right on desktop and spans the phone width.
Wish-list imports save lookup progress automatically and when closing without requiring a complete item or converting it into a saved wish-list draft. Guidance and a single save-status region sit in the form content, leaving two clear footer actions: Add to wish list and Save draft. Existing saved drafts use Save changes and Publish. Gift-idea imports place the filled primary action before outlined Save for later, grouped with an 8px gap and stacked at full width on phones. The footer accounts for safe-area clearance once, subtracting the dialog’s outer gap. Opening a saved draft is quiet; only actual changes trigger save feedback. A successful save keeps its small confirmation in the content so the footer does not jump. Failed saves retain input and offer retry; revision conflicts offer Reload latest with confirmation before discarding edits. No empty feedback slot is reserved. Photo controls, preview,
and upload feedback share one compact group. Saving waits for photo uploads.

Notification delivery setup leads the page, with channel connection status and setup beside its checkbox. Push setup, topic customization, and preview privacy use native disclosures with summaries of their current choices. Collapsed controls remain mounted so saving preserves every selection, including disconnected channels. Deployment-unavailable SMS and Telegram controls, counters, setup actions, and explanatory copy are omitted without placeholders. Remaining controls reflow in the existing wrapping layout. Saving visible controls preserves hidden choices. Preview summaries and follow summaries name only available channels; SMS never offers detailed previews. Notification and follow checkbox rows have 44px targets. Save feedback appears beside the form. Inherited follows name their source choices; person follows explain that the source depends on each wish list. Administration services use labeled status rows. Session rows identify this device where available, with readable browser names and expandable details. Loading and failure states never stand in for empty data.

### Notifications and mentions

The header bell opens a full notification page without adding a sixth mobile navigation item. Flat divided rows show readable activity, optional authorized context, a timestamp, and explicit read controls. Unread rows use the soft theme color plus weight and text controls. All and Unread filters precede the history.

Person, list, and family-group headers and household rows offer follow controls. Following opens a compact settings dialog for inherited/custom channels and stopping the follow. Lists also offer an absolute mute. Private notes offer watching and a keyboard-accessible name picker that only lists accounts allowed to read the note. Notification settings keep channel setup beside controls and provide topic-by-channel choices. Wish-list choices are labeled default channels. A Following and muted lists section uses flat divided rows with target type, inherited/custom channels, and edit controls. Custom settings resolve list, person, household, then group; equal-level choices combine. Empty custom channels mean inbox only. Push permission is requested only from the enable button; unsupported devices retain the inbox.

Push titles identify the activity category, such as New invitation, Ownership request, or Exchange update. The platform supplies the app attribution, so the title does not repeat Little Hint. Normal notification bodies say “Open Little Hint to see the details.” Test notifications use Notifications are ready with “This test notification reached your device.” Missing or unrecognized categories use New activity. With the per-channel Show details in notifications option enabled, wish-list previews may show names, list names, and priorities. These options default off and include examples and a lock-screen disclosure. Item titles, amounts, buying plans, and private note text remain excluded. Other categories remain generic.

### Purchase and exchange actions

Buying rows keep their primary purchase action beside a labeled **More actions** disclosure. Menu actions and labeled triggers use 14px text. Menus have 8px outer padding and no inter-row gap; each action retains at least 44px height with 8px by 12px padding. On narrow screens this group spans the row below the photo and gift details. Update purchase remains available when Mark as purchased is primary; sharing and cancellation live in More actions. Keep destructive confirmation and quantity controls intact.

Exchange status stays with its title. Organizer controls follow the heading and spending guideline, ahead of assignments. Use **Exchange actions** for cancellation, archival, restoration, and trash. Notification delivery details follow assignments in a disclosure; pending or failed delivery opens the details and appears in its summary.

### Gift preferences and discovery

Use searchable, labeled checkbox categories with visible selection and 44px targets. Likes and things to avoid are optional; selected family groups form one audience for all preference fields. Name the audience in the sharing confirmation. Initial setup appears only on the first Home visit. Group its heading, introduction, and full-width outlined Skip for now button inside a warm rounded welcome banner above the interest fields. Navigation defers setup for the current signed-in visit without publishing unfinished preferences; direct links open their requested page. Explicit Skip persists a deferred state without saving unfinished fields, returns to Home, and immediately shows the reminder below the greeting. The Home reminder remains until preferences are saved or its Not now action permanently dismisses it. Existing skipped records remain dismissed; only new setup skips become deferred. Deferral and dismissal preserve saved fields and sharing choices, and failed actions retain a retry path. Preferences remain available in Edit profile on person pages and in Settings. A quiet, underlined Gift preferences text action on both pages opens the preferences tab directly. In Settings it sits below the account details, leaving the outlined Edit profile button as the main action. On screens up to 360px, the profile editor uses one interest column to keep labels intact. Profile and Gift preferences are keyboard-accessible tabs in the same dialog. Switching tabs preserves both drafts. Each tab saves independently and leaves the dialog open; Done and Close protect unsaved changes in either tab. Successful saves clear only that form’s dirty and confirmation state. Saved preferences remain readable on the profile page, subject to the existing audience permissions.

Discovery uses existing typography, colors and open gift rows, with three result columns on desktop and one on narrow phones. Six results appear at a time; Show different ideas changes only the current batch. Keep new-search allowance text beside the explicit paid-search action. Product cards show checked shop prices and linked evidence. Selection editing and final confirmation are separate steps, with focus moved to the confirmation heading. Name destination lists, recipients and visibility before Confirm and add gifts. Prices exclude tax/shipping. Missing or rejected evidence produces an honest empty result, never a fabricated product card.

### Managed-profile managers

The profile editor keeps manager choices in a flat fieldset alongside family-group
sharing. Use the shared labeled search input and checkbox rows, with a visible
name and a quieter role on the next line. Current selections stay above the
search results so the owner remains easy to find. The owner's checked control
is disabled; co-managers see the same names and roles without editable controls.
Long names wrap within the dialog, and selectable rows keep the shared 44px
minimum target. Role labels use the muted foreground rather than a new badge or
color.

Transfer ownership is a secondary text action that reveals the existing select,
checkbox, explanatory copy, and outlined request button. Pending requests use
plain status copy and a separate cancellation action. Loading, failure with
retry, and empty search results occupy the manager section without replacing the
rest of the editor. Preserve the shared profile dialog, tabs, and Save profile /
Done footer; this section introduces no new palette, typography, or elevation.

### Touch dialogs and list rows

Touch-device editing fields use at least 16px text in either orientation. Dialogs
fit the visible viewport while the keyboard opens or closes, with a fixed heading
and one scrollable body. Pinch zoom remains available. The page behind a dialog
cannot scroll, and normal scrolling resumes when it closes.

Wish-list rows reserve a text column for the title and sharing description. Privacy
sits below that copy rather than competing for its width. The Settings introduction
remains visible in every section, including Family groups.

### List maintenance and account dialogs

List-action menus use neutral text and consistently aligned outline icons. Destructive actions use the error color and a preceding divider. Privacy badges and their stationary info icon form one 44px button with a 6px gap. Privacy help opens in a nonmodal native popover and starts closed, including when a gift summary is scheduled or when returning to a list. It keeps the complete reveal policy available without reflowing the page. Tap/click and keyboard activation open it; its close button, Escape, or an outside click dismiss it. Close and Escape restore trigger focus. The panel uses the paper background, control border, 12px corners, 16px padding, and 14px text. Its width is at most 24rem, with 16px viewport insets and internal scrolling for long content. Draft rows use 12px vertical padding, 8px action gaps, and a stacked mobile layout with 44px touch targets.

Administration introductions use muted body copy beneath the shared panel heading. Failed shop lookups and updates use separate collapsed disclosures with counts, ten newest entries at a time, and localized queue timestamps. Diagnostics occupy a separate supporting line.

Phone management separates the primary SMS-choice form from number actions with a divider and 16px spacing. Replace is secondary; Remove uses destructive text and an inline confirmation. Consent boxes align with the first text line. Mobile primary actions fill their row.

### Wish-list identity and private notes

Event-generated lists lead with the recipient: Your wish list or the recipient’s name. Desktop page actions sit beside the recipient heading. Event context sits directly beneath it, with a 20px calendar icon and an 18px, weight-500 event name. Owner and visitor views share that treatment. Saved event descriptions use 16px regular text, 1.6 line height, preserved line breaks, and a 65ch maximum measure on both wish-list and event pages. Privacy and the event-management link share a row, followed by compact management guidance. The privacy explanation appears in an anchored popover. Event lists have an On this wish list section with a compact left-aligned empty state. The visitor’s gift-idea section follows the item collection. Event maintenance uses the existing labeled action menu. Person-page lists use divided navigation rows with secondary type labels.

Event overview pages place sharing and archive information in a wrapping definition list above Participants. Labels use 13px medium text; values and supporting explanations use 14px text. Archive dates use a written month and retain the After qualifier and event timezone to preserve end-of-day meaning. A divider with 24px of space separates these facts from participant navigation.

Profile interest categories are non-interactive tags with the soft background, 13px text, 4px corners, and 4px by 10px padding. Longer preference text remains body copy.

Private-note authors use an ellipsis menu to edit inline or delete with confirmation. Moderators can only delete notes already visible to them. Editing preserves mention behavior, shows Save changes and Cancel, and adds an Edited timestamp label after saving. Menus remain visible on touch devices.

Gift-idea imports use the same private Save for later workflow as item imports. Drafts retain their recipient and intended audience, appear under that person’s Gift ideas and in Your drafts, and never publish automatically. Manual and intentionally cleared fields are protected from shop results.

Button-style controls never underline on hover, focus, or activation; ordinary text links retain their link treatment. Focus uses the existing accent outline for every focusable element. Sharing reviews focus a compact heading; the dialog shell has no redundant outline. Forced-color mode uses the system Highlight color. Follow is omitted for a list’s sole editor and retained when other owners or guardians can add items.

### Price tracking

Item details group the current price with a quieter original-price comparison and
last verification time. Use tabular figures, the existing detail-price role and
13px muted supporting text. State increases, decreases and stale prices in words.
Cards keep only the current price and a compact original-price comparison.
Price-drop subscriptions use the existing labeled checkbox with a 44px target.
Pause/resume is an editor-only text action; errors appear beside these controls. The notification explanation opens from a neighboring info button in a keyboard-accessible native popover. Items without a price omit comparison, verification, and tracking controls, leaving the description at the normal prose gap.
Administration separates price checks and worker activity into compact labeled facts. Schedule, timezone and last-run start precede a dated latest-run summary with total URLs, successful checks, waiting checks, failures, unverifiable prices, allowance deferrals and skipped edits. Seven-day totals and unsuccessful-check diagnostics use a collapsed disclosure; provider attempts remain separate. Worker status includes its last reported time. Active failed imports and past failures use separate disclosures, with published or discarded draft status in supporting copy. Counts retain tabular figures; run headings use 14px semibold type and 20px top spacing.
No chart, new color, font or elevation treatment is introduced.

### Spending assignment and mobile controls

Gift ideas and purchase forms show an optional Wish list for spending field outside collapsed occasion details. Explain that assignment changes spending totals without adding or sharing the gift. An idea assignment preview lists the existing unassigned plans and purchases affected before saving. Guided review uses the existing individual record editor. The Purchased view combines quantity status and separate recorded purchase entries in one dialog, retaining the fixed header and action footer.

Recipient search options use a checkbox, fixed avatar, and one text column. Family groups sit directly below the name; the avatar is centered beside the complete text block. Gift search titles truncate to one line on phones while supporting text wraps. Full titles remain available after selection and to assistive technology. Empty occasion option groups are omitted. Spending status badges contain only the status label, without a leading separator.

Action menus position within the visible viewport above the bottom navigation and below the sticky header. They open upward when that provides more space, remain anchored while scrolling, and scroll internally when needed. Preserve Escape, outside-click dismissal, and trigger focus restoration.

### Connection fallback

Connection screens use approved horizontal artwork, the existing headline and body typography, and the current light or dark palette. Center a narrow text group with generous space after the logo, then a primary retry action. Supporting text uses the muted foreground. Personal draft controls follow as a separate, quieter group. Center the standalone clear-device action beneath this group. Preserve mobile safe-area padding, visible focus, and a stable layout during retries. A playful headline may introduce the problem; the explanation and recovery action stay plain.

## Do's and Don'ts

### Do:

- Do use the approved horizontal or tagline artwork and its dark variant where the component supports it.
- Do keep recipient, gift title, price, and visible availability together.
- Do contain product images and show the labeled placeholder when an image is missing or fails.
- Do keep active availability and other filters visible in the results summary when the filter dialog is closed.
- Do retain visible keyboard focus, named icon controls, reduced-motion behavior, and mobile safe-area padding.

### Don't:

- Don't reconstruct the logo lettering or substitute a display font for the approved artwork.
- Don't add shadows to ordinary gift cards or list rows.
- Don't use invented product photography or present demonstration fixtures as real gifts.
- Don't rely on color alone to explain availability or list privacy.

### Spending controls and purchase entry

Spending pages separate header actions, personal/shared view selection, and the filter scope. Person, occasion, and period remain visible; less common filters expand. Filters retain focus and scroll while results refresh. Recorded amounts and outstanding estimates have separate completeness explanations. Unknown-only totals never look like a confirmed zero.

Purchase entry uses an anchored gift combobox with an explicit manual option, bounded recipient search, and the existing fixed dialog action footer. A linked gift inherits recipients and event context. Listed prices are suggestions accepted explicitly. Optional occasion details preserve both personal occasions and group events. History rows vertically center gift details against the amount and action group on desktop, then stack on mobile. Purchase dialogs keep Save first and Cancel second on one row. At visible viewport heights of 500px or less, they fill the available height with 8px outer gaps and compact fixed heading/footer padding. Search results are positioned within the dialog outside the scrolling body, use gift icons, and separate the manual option with a divider. Recipient chips use neutral borders and integrated remove controls. Their visible background is 32px high while the remove target retains 44px height. More filters uses a chevron and selected fill when expanded, without a numeric suffix. Spending wish-list options use person optgroups, including combined-owner groups for joint lists and preserved historical list choices. A sole secondary action is directly available and underlined; menu entries never underline. On phones, the labeled action menu shortens to More; multiple actions use the existing anchored menu without expanding the row. Purchase history opens separately. Quick totals remain compact, with a clear View spending button. Settings page actions are left-aligned with the primary action first in visual and keyboard order, 12–16px gaps, and comfortable desktop field widths. Checkbox labels use the shared centered checkbox pattern. Extra filters expand below stationary primary controls. Adjacent payment fields align at the top even when only one has helper text. Edit-purchase forms emphasize the gift title and show split controls only for multiple recipients.

### Contextual help and closure review

Amount-paid guidance and price-drop details use the shared InfoHelp popover. Its
15px info icon has a 44px target and a compact 25px hover/open highlight; help sits beside the label without becoming part
of the checkbox or input label. Purchase payment labels reserve 28px so the target
ends above the input while amount and date fields remain aligned. The compact panel
uses 13px body text, 12px padding, and at most 20rem width with 12px viewport insets.
The repeated title stays available to assistive technology without taking visual space.
Native top-layer positioning escapes dialog scroll containers and prefers above the
trigger, falling below when needed to stay visible. Escape, outside click, and a close button dismiss help; keyboard focus
returns to its trigger. Purchase estimates sit directly below the amount field,
with a separate Use listed price button and a quantity calculation when needed.

Reservation success messages include an underlined Open Buying link with a 44px
minimum target. They remain for ten seconds; hovering or focusing pauses dismissal,
and leaving starts a fresh interval. Activating the link dismisses the message and
opens Buying. Other success messages retain their five-second default.

Account-closure blockers sit under Resolve these first with 14px subordinate
headings, compact supporting copy and 24px between tasks. They have no row
dividers. Destination-specific secondary links lead to family groups, commitments,
or exchanges. Handoff and closure confirmation behavior is unchanged.

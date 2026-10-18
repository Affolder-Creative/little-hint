---
name: Little Hint
description: Gift ideas, shared thoughtfully.
colors:
  bg: "#fff8f0"
  paper: "#fffdf9"
  text: "#2b201d"
  muted: "#746057"
  border: "#e6d9cf"
  accent: "#aa4d37"
  on-accent: "#fff8f0"
  soft: "#f4e4da"
  green: "#486348"
  error: "#9f3327"
  dark-bg: "#2b201d"
  dark-paper: "#342722"
  dark-text: "#fff8f0"
  dark-muted: "#cbb6aa"
  dark-border: "#59453b"
  dark-accent: "#f1bead"
  dark-on-accent: "#2b201d"
  dark-soft: "#49332b"
  dark-green: "#bdd0aa"
  dark-error: "#ffb1a2"
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
rounded:
  badge: '4px'
  control: '8px'
  panel: '12px'
  image: '14px'
  dialog: '16px'
  avatar: '50%'
spacing:
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

The palette uses warm neutrals for reading and sienna for actions. The frontmatter records the actual custom properties in `src/client/style.css`; `dark-` entries are the matching overrides under the dark theme selector.

### Primary

Sienna `accent` identifies primary actions, text actions, selected tabs, and keyboard focus. `on-accent` provides their text color. Dark mode replaces this pair with light blush on umber.

### Secondary

Blush `soft` supports active navigation, notices, invitations, and installation guidance. `green` and `error` are semantic feedback colors, with readable dark-theme counterparts. Availability badges use their own muted green fill and text, recorded in the component sample.

### Neutral

Ivory `bg` is the page background; `paper` is the slightly lighter sidebar, input, and dialog background. Umber `text` carries the reading hierarchy. `muted` handles supporting copy and `border` separates rows and controls. Dark mode uses umber backgrounds, ivory text, and lighter muted text.

**The semantic color rule.** Use the theme variables for interface text, controls, and backgrounds so light and dark modes preserve their roles.

## Typography

The approved logo has outlined Fraunces artwork. It does not require loading a web font. All interface text uses the system sans stack in the frontmatter, including page headings; this is the user-approved identity.

Page headings use a responsive size with restrained weight and tight tracking. Section headings step down to 22px; ordinary component titles use 17px, and gift titles use 16px. Paragraphs use a 1.6 line height. Common form labels use 13px and medium weight. No separate mono family is established.

At 900px and below, page headings are 32px; at 650px and below, they are 30px. Gift titles become 15px and then 14px at the same breakpoints. Supporting description widths are capped at 65ch on desktop and 40ch on narrow screens. Login-specific display sizes are local composition choices, not a general type role.

**The artwork rule.** Use the supplied logo and symbol assets. Do not recreate their lettering with live text.

## Layout

The desktop shell has a fixed 242px sidebar and matching main offset. Content is centered within a 1400px maximum width, with 44px horizontal padding. At 1200px and below, the sidebar narrows to 210px and content padding to 28px. At 900px and below, the sidebar gives way to a top logo bar and fixed bottom navigation, with safe-area padding. Content padding becomes 24px, then 20px at 650px and below.

Home, People, My lists, Buying, and Exchanges are the persistent navigation destinations. Settings and private groups remain together. The first home view pairs the logo and clear navigation with welcome copy and gift browsing controls.

Gift browsing uses three equal columns, then two at 650px and below. Desktop gaps are 28px vertically and 22px horizontally; narrow-screen gaps are 28px and 15px. People use two columns before becoming a single list. Gift details use two columns before stacking on narrow screens. Recurring gaps and padding use the spacing steps in frontmatter, alongside local layout measurements.

Search, tag filtering, and the availability checkbox can wrap. At 1200px and below, availability occupies a full row and remains visible on phones. Profile avatars keep their fixed size while adjacent settings copy can grow.

## Elevation & Depth

Ordinary content is flat. Paper tones and thin borders distinguish controls, navigation, and groups of information. Dialogs and transient toasts use soft shadows; the dialog also dims the page with a translucent backdrop. Exact shadow and backdrop values live in the sidecar.

**The flat content rule.** Gift cards and ordinary list rows have no shadow. Reserve elevation for dialogs and transient messages.

## Shapes

Controls have gently rounded 8px corners. Status labels and tags use small 4px corners. Repeated notice panels use 12px corners, gift image areas use the 14px root radius, and dialogs use 16px corners. Mobile gift images use 12px corners. Avatars are circles with initials and muted color variations.

Borders are generally a single pixel in the theme border color. The gift-image container clips its contents; product images use `object-fit: contain` with internal padding. The approved heart-tag silhouette belongs to the brand artwork and empty states.

## Components

### Buttons

Primary buttons use the accent pair, medium-bold 14px text, and 12px by 18px padding. Secondary buttons use paper, text, and a border. Both have a 44px minimum height and a slight brightness reduction on hover. Text buttons use accent text and underline on hover; install-panel text actions use the main text color. Icon buttons use a soft fill on hover.

Keyboard focus is a 3px accent outline with a 3px offset. Disabled buttons reduce opacity and use the unavailable cursor. Small button variants keep the 44px minimum height. Some compact mobile header and update controls use local sizing; do not apply those exceptions to general form controls.

### Chips

Availability labels use text as well as color. Available gifts use a muted green fill; taken-care-of gifts use the soft theme fill; an owner's list membership uses a quiet text treatment. Tags use an outline and compact corners. These are informative labels, not decorative counters.

### Cards / Containers

Gift cards are unboxed links. A contained image or labeled fallback leads, followed by recipient, title, price, availability, and up to two tags. The title underlines on hover. Images use a 1.13 aspect ratio on desktop and become square on narrow screens. People, lists, purchases, and settings use open rows with bottom dividers. Invitations and installation prompts use soft rounded panels.

### Inputs / Fields

Fields have a paper background, text color, thin border, 8px corners, and a 44px minimum height. Visible labels and optional hints stay with their inputs. Search adds a leading icon and transparent fill. Forms show errors in text; busy submission disables the fieldset and changes the action label. The global focus outline applies to inputs, selects, and textareas.

### Navigation

Desktop navigation combines outlined SVG icons with labels. Muted inactive links gain stronger text and a subtle background on hover; active links use soft fill. Mobile navigation keeps icons and labels together and marks the active destination with accent text. Theme and settings actions remain in the top bar on mobile. A keyboard skip link reaches the main content.

### Privacy and feedback

Privacy badges combine a lock or eye SVG with the words Surprise or Transparent. Native modal dialogs have a sticky title and close control. Empty states reuse the approved heart tag with a heading, explanation, and optional action. Installation guidance uses the approved app icon and normal action controls. Reduced-motion preference disables animations and transitions; normal motion is limited to a loading spinner and a brief toast arrival.

## Do's and Don'ts

### Do:

- Do use the approved horizontal or tagline artwork and its dark variant where the component supports it.
- Do keep recipient, gift title, price, and visible availability together.
- Do contain product images and show the labeled placeholder when an image is missing or fails.
- Do keep the availability checkbox visible when filters wrap on small screens.
- Do retain visible keyboard focus, named icon controls, reduced-motion behavior, and mobile safe-area padding.

### Don't:

- Don't reconstruct the logo lettering or substitute a display font for the approved artwork.
- Don't add shadows to ordinary gift cards or list rows.
- Don't use invented product photography or present demonstration fixtures as real gifts.
- Don't rely on color alone to explain availability or list privacy.

## Sign-in and spacing refinement

Page titles sit 8px above their descriptions. Headers leave 24px before content on desktop and 20px on mobile; filters leave 20px before gift grids. Section breaks use 32px on desktop and 24px on mobile. Security and administration subheadings have explicit space above them, and gift quantity controls leave 16px before the reservation action. Mobile gift recipients use 12px text; tags, status labels, and navigation labels use at least 11px.

The landing page keeps the approved artwork at 240px wide on desktop and 190px on phones. Its headline is capped at 56px on desktop and 34px on phones. Code entry is a distinct step with a prominent numeric field, expiry guidance, and separate resend and change-email actions. Controls remain at least 44px high.

Transactional emails use a 560px maximum-width, table-based layout with inline styles, the embedded 180px horizontal logo, a 26px heading, and a warm paper panel. Sign-in codes are selectable 32px text. Invitations and updates use a single action; previews remain generic to preserve surprises. Plain-text alternatives carry the same information.

Browser favicons use the approved micro tag without a surrounding tile. The tag is sienna `#AA4D37` in light mode and blush `#F1BEAD` in dark mode; the heart is a transparent cutout. SVG and ICO links follow the app appearance setting, with a system-adaptive SVG before the app loads. Installed and Apple touch icons retain their platform-safe tiles. Regenerate favicon exports with `node scripts/build-favicons.mjs`.

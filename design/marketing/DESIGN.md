---
name: Little Hint marketing
description: Warm, screenshot-led marketing for a private gift coordination app.
colors:
  bg: "#fff8f0"
  paper: "#fffdf9"
  ink: "#2b201d"
  muted: "#746057"
  accent: "#aa4d37"
  accent-hover: "#913e2c"
  blush: "#f4e4da"
  line: "#e6d9cf"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(42px, 4.5vw, 62px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(30px, 3.1vw, 43px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    lineHeight: 1.65
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  action: "8px"
  screen-detail: "12px"
spacing:
  compact: "12px"
  action-gap: "14px"
  content-gap: "22px"
  section: "30px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "13px 22px"
  button-secondary-hover:
    backgroundColor: "{colors.blush}"
  screen-detail:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.screen-detail}"
    padding: "12px"
---

# Design System: Little Hint marketing

## Overview

**Creative North Star: "See it together"**

This record covers the finished static marketing page in `marketing/index.html` and `marketing/style.css`. It follows the user's selected concept B in `design/marketing-concepts/b-see-it-together.png`. The application has its own root `DESIGN.md`; this document does not change that system.

Ivory backgrounds, sienna actions, blush sections, and Fraunces headings surround actual app captures. The approved SVG logo supplies the lettering. The marketing page stays light regardless of system theme. Product screenshots explain gift coordination, while compact feature descriptions keep the page short.

**Key Characteristics:**

- Approved logo artwork, with Fraunces for page headings.
- Warm, fixed light colors and restrained borders.
- Real app screenshots with disclosed illustrative fixtures.
- Compact feature rows and responsive device presentation.

## Colors

The palette combines warm neutrals with sienna actions and a blush feature band. Frontmatter records the exact CSS values.

### Primary

- **Sienna**, `accent`, identifies actions, capability icons, keyboard focus, and hovered navigation.
- **Deep sienna**, `accent-hover`, marks primary button hover.

### Secondary

- **Blush**, `blush`, separates the feature band and fills secondary button hover.

### Neutral

- **Ivory**, `bg`, is the page and screenshot detail background.
- **Paper**, `paper`, supplies primary button text and the skip-link background.
- **Warm brown**, `ink`, is the main text color.
- **Muted brown**, `muted`, identifies supporting notes and captions.
- **Warm divider**, `line`, separates header, capabilities, and footer.

**The Fixed Light Rule.** Marketing retains its light palette; the application's dark theme does not propagate into this page.

## Typography

Fraunces, with Georgia and serif fallbacks, supplies every heading. Heading weight, tight tracking, balanced wrapping, and the `SOFT` 65 / `WONK` 1 variable settings remain consistent. The body and controls use the platform sans stack. The logo remains artwork rather than recreated type.

Display, headline, and feature title form a descending serif hierarchy. Feature and hosting copy use the body role; notes and captions step down to 12–14px. The hero description uses 20px and 1.55 line height on larger screens, then 17px on phones. Feature paragraphs cap at 52ch, with hosting explanations capped at 60ch.

At 600px and below, the hero uses `clamp(36px, 9.7vw, 54px)`, feature titles use 25px, and the self-host heading uses 33px. These are responsive adjustments rather than another type family.

**The Artwork Rule.** Use the approved logo SVG intact; Fraunces headings do not replace its lettering.

## Layout

The shared container caps at 1160px with 40px side gutters. At 900px and below, gutters become 24px; at 600px and below, they become 20px. Header and footer use horizontal alignment on desktop and centered, wrapped arrangements on phones.

The centered hero leads into a broad desktop screenshot with an overlapping phone capture. At 600px, the desktop frame disappears and the phone becomes a centered, in-flow image capped at 300px wide. Hero actions stack with a 330px maximum width.

The blush band contains two feature articles side by side, each pairing a screenshot detail with copy. At 900px the articles stack; at 600px each image and its copy stack as well. Capabilities change from four columns to two at 900px. Sections use modest vertical padding around 30px, with larger breathing room reserved for the hero.

## Elevation & Depth

The page uses blush and ivory areas, thin dividers, and open whitespace. Only the device frames share the ambient screenshot shadow recorded in the sidecar. Feature screenshots have flat ivory containers. Device bezels are illustrative framing, not a general card style.

**The Screenshot Depth Rule.** Reserve the shared ambient shadow for framed product captures; ordinary page content stays flat.

## Shapes

Actions have gently rounded corners using the action radius. Repeated screenshot detail containers use the larger screen-detail radius. The desktop and phone silhouettes have their own device-specific corners and dark bezels. Their dimensions should not become generic UI container tokens.

## Components

### Buttons

Primary buttons pair sienna backgrounds with paper text. Secondary buttons use sienna text and a one-pixel sienna outline over a transparent background. Both have a 50px minimum height and aligned SVG icons. Primary hover deepens the background; secondary hover fills with blush. Background transitions take 160ms with ease-out and disappear under reduced motion.

All links receive a visible sienna focus outline, 3px wide with 5px offset. Inline text links keep an underline and at least 44px height. They use sienna text, with 14px semibold type.

### Navigation

Header navigation uses plain sans text, small SVG icons where needed, and a 44px minimum target height. Hover adds sienna and an underline. On phones, navigation occupies its own centered row below the logo. The skip link appears on keyboard focus.

### Screenshot details

Feature captures sit inside flat ivory containers with rounded corners and modest padding. These are real app images, not reconstructed widgets. Preserve the original screenshot proportions, meaningful alt text, and the visible statement that data is illustrative. `marketing/assets/screens/capture.json` records the unmodified React capture source, isolated `example.test` fixtures, and capture command.

### Capability row

Small sienna outline SVGs sit beside sans labels. The row has a lower divider and no individual card boxes. SVGs use rounded stroke caps and joins; decorative icons remain hidden from assistive technology.

## Do's and Don'ts

### Do:

- Do preserve approved logo artwork and the selected concept's warm palette.
- Do use actual app screenshots and disclose illustrative demo data.
- Do keep feature copy compact and screenshot details readable at phone widths.
- Do preserve keyboard focus, the skip link, and reduced-motion behavior.

### Don't:

- Don't inherit the application's dark theme into this fixed light marketing page.
- Don't recreate the approved logo lettering with a font.
- Don't replace product captures with invented app interfaces.
- Don't apply device bezels or screenshot shadows to ordinary text sections.

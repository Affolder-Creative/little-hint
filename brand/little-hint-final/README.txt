LITTLE HINT · HEART-TAG IDENTITY
Final asset package, version 1 · 18 October 2026

START HERE
Open brand-preview.html for the finished identity, or visual-guide.html for
all treatments, actual-size favicon samples, and platform icon crops.
previews/final-brand-preview.png is the shareable overview image.

FINAL REFINEMENTS
The original heart tag, 14-degree tilt, warm palette, and Fraunces lettering
are retained. The name is now Little Hint, with custom letter-pair spacing.
The space between Little and Hint is reduced by 60 font units, approximately
15% of the font's original space advance. Both words remain clearly separated.

The tagline reads: Gift ideas, shared thoughtfully.
It is integrated into the tagline SVG and PNG, left aligned beneath the
wordmark with a fixed 12-unit visual gap. The tagline width is 86% of the
wordmark width. The bottom of the tag aligns with the complete text block.
Do not recreate the tagline as a separate paragraph with its own margins.

All logo lettering is outlined. The heart and punched hole are transparent
cutouts. No font installation or network connection is needed to use the
finished SVG and PNG artwork.

FILE CHOICES
logos/     Horizontal, stacked, wordmark-only, and attached-tagline logos.
symbols/   Standard tag and micro tag, each on a transparent background.
icons/     Full-bleed app icons, maskable icons, and Apple touch icons.
favicons/  16, 32, 48 px PNGs; multi-size ICOs; SVGs; pinned-tab silhouette.
previews/  Rendered overview, visual guide, and mobile previews.
source/    Rebuild scripts, original font, and font license.
integration/head.html  Copyable web integration examples.
manifest.webmanifest   Starter PWA manifest with relative image paths.
tokens.json / tokens.css  Exact identity colors and typography settings.
ASSET-INDEX.txt  Complete list of the 92 artwork files.

For a compact logo use logos/little-hint-horizontal-color.svg.
For the logo with tagline use logos/little-hint-tagline-color.svg.
Transparent PNG equivalents are in logos/png/ and symbols/png/.
SVG is the preferred scalable original for websites, layout, and print.

COLOR AND BACKGROUNDS
Sienna       #AA4D37   Primary artwork on light surfaces; stable app tile.
Blush        #E9B5A5   Supporting accent.
Ivory        #FFF8F0   Light surface; reversed mark on sienna.
Umber        #2B201D   Dark surface and optional dark app tile.
Dark accent  #F1BEAD   Tag on dark surfaces.

-color: sienna logo for white, ivory, and other very light backgrounds.
-dark: blush tag with ivory lettering for umber and other dark backgrounds.
-black: pure black artwork with a transparent background.
-white: pure white artwork with a transparent background.
-adaptive: switches between color and dark using prefers-color-scheme.

Dark and adaptive logo files do not paint a background. Your app supplies it.
Use explicit color/dark files if the app theme differs from the OS preference.
Adaptive SVGs cannot read a theme class on the surrounding page.
For design tools, use the explicit color, dark, black, or white versions.

APP ICONS AND FAVICONS
Standard app exports: 64, 128, 192, 256, 512, 1024 px, in color and dark sets.
Apple touch icons: 180 px, opaque, with no baked-in rounded corners.
Maskable exports: 192 and 512 px, with extra inset; use purpose=maskable.
All app icon tiles are full-bleed squares; the platform supplies the mask.
Rounded and circular crops in the guide are previews only.

Use the sienna/ivory icon as the stable installed identity. The manifest uses
this set. Dark PNGs are optional alternatives, not an automatic OS switch.

favicon.svg is the automatic light/dark micro mark.
favicon.ico is the color fallback with exact 16, 32, 48 px PNG entries.
Explicit color/dark PNGs, SVGs, and ICOs are also included.
The micro mark uses a larger heart and omits the punched hole at all sizes.

SPACING AND SIZE
Preserve the aspect ratio and use height:auto when setting a display width.
Do not stretch, skew, add outlines, or set the logo on a busy background.
Keep at least one heart-lobe width of clear space around the artwork.
Suggested minimum display widths: horizontal 170 CSS px, tagline 360 CSS px,
stacked 160 CSS px. Use the wordmark without the tagline in smaller placements,
and the standalone symbol for very small spaces. Review against the actual
background and device. The SVG viewBox margins are intentional.

INSTALLATION
Copy logos/, symbols/, icons/, favicons/, and manifest.webmanifest into
public/brand/little-hint/ and adapt integration/head.html to your app.
Update manifest id, start_url, scope, and HTML paths when hosted in a subpath.
These assets do not install or configure the app itself.

REBUILDING
Install source/requirements.txt with Python and source/package.json with npm.
Run source/build_vectors.py, followed by source/build_exports.cjs.
Optional browser checks: source/verify_preview.cjs.
Set LITTLE_HINT_BROWSER to a Chromium executable if needed.
source/render_brand_preview.cjs renders the additional brand board; its
executable path can be adjusted for the local browser installation.

Python dependencies: fonttools 4.67.0, uharfbuzz 0.56.3.
Node dependencies: sharp 0.35.5, playwright 1.62.1.
Wordmark axes: weight 650, optical size 60, softness 65, wonk 1.
Tagline axes: weight 480, optical size 60, softness 65, wonk 1, with simplified
outlined lowercase f forms. The original font file is unmodified.
The included Fraunces font is licensed under the SIL Open Font License 1.1;
see source/fonts/OFL.txt. Lettering in the exported logos is already outlined.

VERIFICATION
verification.json records desktop and mobile guide checks, actual display
sizes, adaptive SVG colors, and embedded adaptive favicon behavior.
previews/brand-preview-verification.json records the mobile brand board check.
asset-verification.json records artwork counts, PNG dimensions, transparency,
and SVG lettering checks. Physical-device installation has not been tested.

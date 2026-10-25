# Fraunces display font

The marketing page preloads and serves `Fraunces-variable.woff2`. It is a
full-font WOFF2 conversion of `Fraunces-variable.ttf`, with all 698 glyphs and
variable-font axes preserved. The original TTF remains the source for conversion
and the social-preview generator. Both files are covered by `OFL.txt`.

Regenerate with FontTools 4.67.0 or a compatible version with WOFF support:

```sh
uv run --with 'fonttools[woff]==4.67.0' python -c "from fontTools.ttLib import TTFont; f = TTFont('marketing/assets/fonts/Fraunces-variable.ttf'); f.flavor = 'woff2'; f.save('marketing/assets/fonts/Fraunces-variable.woff2')"
```

The WOFF2 is 195,076 bytes, compared with the 360,440-byte source TTF.
The existing site transferred the TTF compressed, so the practical transfer
reduction is about 51 KB, or 21%, rather than the 46% raw-file reduction.

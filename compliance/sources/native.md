# Sharp native corresponding sources

This bundle covers @img/sharp-libvips 1.3.4 for Linux musl AMD64 and ARM64.
The release tag resolves to sharp-libvips commit
`ebb95f8add54eee8bed840e3fb587e4cbec857d7`. Its versions.properties agrees with
all 28 native-library versions reported by the installed npm binaries.

MANIFEST.json records every source URL, SHA-256 and byte size. Source archives
retain their upstream licenses. The recipe archive contains build/posix.sh,
build.sh, platform Dockerfiles, compiler flags, Meson/CMake files, npm packaging
and notices. Both musl platform definitions are included. Input patches include
GLib, mozjpeg, librsvg, libultrahdr and libvips fixes; the recipe also applies
inline sed edits, which must be retained when rebuilding.

Extract sharp-libvips-recipe.tar.gz and follow its README and build.sh for
linuxmusl-x64 or linuxmusl-arm64v8. Use the source files from this bundle at the
URLs named in MANIFEST.json instead of downloading newer files. The original
recipe's toolchain installation uses general-purpose build tools; those tools
are not included here. This is source/build-input coverage, not a claim of a
bit-for-bit reproducible compiler toolchain or binary rebuild.

GLib uses the included GVDB source at commit
2b42fc75f09dbe1cd1057580b5782b08f2dcb400. Extract that archive into the GLib
source's subprojects/gvdb directory before Meson runs. The other enabled native
dependencies are built earlier in posix.sh. GLib's regex dependency is removed
by the included patch; disabled documentation/profiling fallbacks are not used.

The librsvg 2.63.2 release includes Cargo.lock. All registry crates from that
lockfile are included here, including unused target/test crates. With Python
3.12 or newer, run `python3 vendor-source-crates.py` from this directory. It
verifies and extracts the crates and writes a Cargo directory-source config.
Set CARGO_HOME to the printed path when running the Rust portion of the recipe.
If building in Docker, run this helper inside that container or adjust the
absolute vendor path in cargo-home/config.toml to its container mount path.

The upstream recipe removes GIF/WebP and Cairo PDF/PS features before running
`cargo update --workspace`. Repeating those edits and that command with network
disabled removed color_quant 1.1.0, gif 0.14.2, image-webp 0.2.4 and weezl 0.1.12;
it added/upgraded no crates. The complete original lockfile's crate set therefore
covers the post-edit build too. Cargo metadata resolved offline after the edits.

The libultrahdr input is the complete multi-commit patch for merged PR 383,
head 7af35883ee575266cc43bbd05686734ebd5b1a82, merged 2026-09-18. Apply it
in sequence, not as independent dry runs. All five external patches were
checked against the matching source archives.

## Replacing the LGPL library

The runtime loads libvips dynamically from the platform-specific
`/app/node_modules/@img/sharp-libvips-linuxmusl-{x64,arm64}/lib` directory.
A derived image can COPY a rebuilt, ABI-compatible libvips-cpp.so.8.18.7 and any
required dependent shared libraries into that directory. Rebuild the library
using the included sources, modifications and platform configuration. Preserve
the shared-library names and Sharp ABI, then rerun the image smoke test. No
signature check or product license term prevents library replacement or
debugging changes to LGPL components. Static dependencies inside libvips can be
modified by rebuilding that shared library from these sources.

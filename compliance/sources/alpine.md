# Alpine runtime corresponding sources

Each alpine/<origin>/ directory includes the complete aports archive at the
commit recorded in the installed APK database, plus that recipe's downloaded
source inputs. The runtime's exact package/version/commit identifiers appear in
MANIFEST.json. This covers both AMD64 and ARM64, including their architecture
configurations and patches. All local source files and external inputs were
checked against the APKBUILD's SHA-512 entries before their SHA-256 values were
recorded here. Upstream licenses remain in the sources and recipe archives.

For each origin, extract aports.tar.gz and inspect main/<origin>/APKBUILD.
Use the same Alpine release and architecture with the normal abuild toolchain.
Extract the recipe directory or work in the extracted aports tree. Put the
accompanying source downloads in abuild's source cache under their recorded
filenames, then run abuild's checksum, unpack, prepare and build/package steps.
APKBUILD contains source edits, patch ordering, configure flags, installation
scripts and subpackage rules. Its local patches/configurations are in the same
recipe directory in the aports archive. General-purpose compiler/build tools
and their package-manager installation are separate from these materials.

The installed origins covered here are alpine-baselayout, apk-tools, busybox,
ca-certificates, gcc, musl and pax-utils. Subpackages such as libgcc, libstdc++,
libatomic, ssl_client and musl-utils use their origin's sources, including GCC
runtime exceptions and per-file license texts. Musl's origin is included because
its musl-utils subpackage carries additional copyleft code even though the
primary libc is MIT. Alpine's distfiles mirror copies were verified against the
original recipe hashes; MANIFEST.json also preserves the original source URLs.

The Node 24.22.1 container base pins Alpine 3.24.3 by digest, including
ca-certificates 20261020-r0 and musl 1.2.6-r3. The musl recipe includes
its updated regex overflow patch; all recipe inputs match their SHA-512 entries.
A changed installed package version or aports commit requires a fresh review;
the release gate does not accept merely matching package names.

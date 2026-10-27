# Licensing and redistribution

Little Hint's original code and artwork are offered by **Affolder Creative**
under [PolyForm Perimeter 1.0.0](../LICENSE). This is source-available software,
not an OSI-approved open-source project. The license restricts providing
competing products or services to others, including competing products offered
free of charge. Read the license before distributing a fork or offering hosting.
Personal self-hosting and internal use are the intended uses of this app.

Affolder Creative can offer separate commercial permission for rights it owns.
The license does not transfer ownership of dependencies or override their terms.
Contact the repository maintainer about commercial licensing. Naming Affolder
Creative assumes it holds the original project's rights; a copyright notice
alone does not transfer ownership from an individual or another business.

Original project terms do not replace third-party licenses. In particular,
third-party LGPL/MPL/GPL components retain their own modification,
redistribution, source-access, and other rights. Nothing in Little Hint's
licensing guide adds restrictions to those components or to debugging changes
to LGPL libraries. Native libraries must remain replaceable as required by their
licenses. Outside code contributions are on hold as described in
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Audit findings, 2026-10-18

The audit inspected the application lockfile, installed package license texts,
production container contents, the preserved brand sources, and the separately
referenced backup sidecar. It distinguishes license metadata from an actual
redistribution clearance.

| Component                              | Finding                                                                                       | Handling                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Most npm packages                      | MIT, ISC, Apache-2.0, BSD, or other permissive terms                                          | Preserve full notices, including bundled third-party notices.                                                                                                                                                                                                                            |
| Sharp/libvips                          | The `@img/sharp-libvips-*` 1.3.4 binary includes LGPL libraries and other native dependencies | Preserve GPL/LGPL texts and upstream notices; publish the reviewed native source bundle below.                                                                                                                                                                                           |
| Lightning CSS                          | MPL-2.0; present in the current production installation through the dependency graph          | Include its notices and the reviewed Lightning CSS source bundle.                                                                                                                                                                                                                        |
| axe / Playwright accessibility tooling | MPL-2.0; development/test tooling                                                             | Retain notices in the audit; do not treat use during testing as relicensing the app.                                                                                                                                                                                                     |
| Fraunces font                          | SIL Open Font License 1.1, already included with the original font                            | Keep the font and OFL notice together. The exported logo outlines are artwork, not a replacement font distribution.                                                                                                                                                                      |
| Python brand tools                     | fonttools 4.67.0 under MIT, with external notices; uharfbuzz 0.56.4 under Apache 2.0          | Preserve the tool inventory and bundled notices. They are not installed in the app image.                                                                                                                                                                                                |
| npm brand tools                        | Sharp and Playwright, separately locked                                                       | Audit without running asset generators or changing the original artwork archive.                                                                                                                                                                                                         |
| Alpine runtime                         | Includes copyleft utilities and libraries as well as permissive components                    | Inventory exact packages and aports source revisions; supply required sources alongside image downloads.                                                                                                                                                                                 |
| Node runtime                           | The pinned image supplies Node 24.22.1, including embedded third-party components             | Preserve Node's complete upstream LICENSE and the Docker entrypoint license. The build checks the Node version; base-image updates require matching notices. Unused package managers are removed before copying the final filesystem, so their bytes are absent from distributed layers. |
| Optional backup sidecar                | The user controls Housewatch Digital; its public repository currently has no license file     | Separate upstream licensing task. It is not bundled into Little Hint's images or image archives.                                                                                                                                                                                         |
| External providers                     | SMTP, Telegram, Twilio, OpenAI and scraping services are optional network integrations        | Operator credentials and provider terms are separate from distribution of this code; no service credentials are packaged.                                                                                                                                                                |

Several packages omit a standalone license file. The notice generator recognizes
complete MIT text embedded in READMEs and uses version-scoped fallbacks for the
remaining cases. Upstream locations are recorded in
`compliance/licenses/provenance.json`. Native esbuild, Rolldown and Rollup
packages use the matching parent package's notices. Rolldown's third-party
license file and Lucide's Feather attribution are included, not just their
package-level SPDX labels.

One Linux/glibc-only development dependency, `@napi-rs/lzma-linux-x64-gnu`
1.5.1, declares MIT but omits license text in both published packages and the
matching source release. Its exact-version development-only exception records
the gap in the generated inventory; it does not fabricate a copyright grant.
Rollup uses it as an optional build tool. It is not imported by the client and
is absent from the Alpine runtime. Redistributing that tool's binary requires
resolving its notices first. The exception fails if it becomes a production
dependency or its version changes.

## Reviewed corresponding-source bundles

The current AMD64 and ARM64 image inventories are covered. Together they require
48 exact package/version/source-revision identifiers, 46 per architecture. The
four bundles are assembled from 642 downloaded inputs and checked-in build
instructions. Every downloaded byte is SHA-256 pinned; the final archive hashes
are recorded in `compliance/source-bundles.lock.json`.

| Bundle                               | Reviewed materials                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alpine-3.24.3-sources.tar.gz`       | Seven exact aports recipe revisions and their external inputs. All source downloads and local patches/configurations match the APKBUILD SHA-512 values. Includes both architectures' configuration and subpackage rules.          |
| `sharp-libvips-1.3.4-sources.tar.gz` | The release recipe, all 28 reported native library versions, five external patches, GLib's pinned GVDB source, and the complete original librsvg Cargo.lock crate set. Both musl platform recipes and inline edits are preserved. |
| `lightningcss-1.33.0-sources.tar.gz` | The exact npm gitHead source tree, JavaScript wrappers, Rust toolchain/build workflows, Cargo.lock and all locked registry crates. The Git tag changed the toolchain after the npm revision, so the npm revision is used.         |

The Rust downloads comprise 590 crate inputs across the two workspaces, each
verified against its upstream Cargo.lock checksum. Applying Sharp's feature
edits and `cargo update --workspace` with network disabled removed four unused
crates and added/upgraded none. Both workspaces' Cargo metadata resolved offline.
The included helper prepares Cargo's vendored directory source without network
access. All five external native patches were checked against their sources,
including sequential application of the multi-commit libultrahdr patch.

These are complete reviewed source/build-input bundles for these packaged
components. This review does not claim bit-identical rebuilds of upstream
binaries or preservation of an entire historical compiler toolchain.
General-purpose compilers/build tools are installed separately. The source
archives retain their original licenses; Little Hint's product license does
not replace them. Node's bundled notices include ICU build-script exceptions;
those build scripts do not add an unhandled runtime source requirement here.

Each source bundle has a README with build and library-replacement guidance,
original source archives, patches, build recipes and its input manifest. Shared
source bundles are attached once to each GitHub Release, alongside both image
archives. Each platform's compliance download records their hashes and coverage
in `sources/BUNDLES.json`. Container users can also inspect
`/app/compliance/sources` and `/app/compliance/source-materials.json`.

CI and release jobs inspect the actual built image, fetch or reuse sources,
rehash cached inputs, assemble the bundles, and compare their complete bytes
with the reviewed archive hashes. A missing input, hash mismatch, corrupt cache,
changed runtime component, empty inventory, or changed bundle fails the job
before publication. The base image digest pins the runtime Alpine packages, including its existing
CA certificate bundle. The build does not fetch additional Alpine packages.

To review a dependency or base-image update:

1. Extract the new image's `/app/compliance-report` and run
   `node scripts/release-sources.mjs PATH`. Review every new identifier and the
   upstream sources, patches, lockfiles and build instructions that produced it.
2. Update `compliance/source-materials.json` with exact coverage, source URLs,
   byte sizes and SHA-256 values. Preserve upstream licenses and all needed
   build inputs. Update the bundle README in `compliance/sources/`.
3. After reviewing the inputs, run
   `node scripts/release-sources.mjs PATH --record-bundles` to record the newly
   reviewed archive hashes. This maintainer-only review command is never used
   by CI or publishing. Verify both architectures and cross-environment output.
4. Commit the manifest, instructions and archive lock together through a PR.
   CI downloads and builds the actual source bundles. New releases attach them;
   do not alter an existing release tag or silently substitute source bytes.

Large archives are not stored in Git. They are reproducibly assembled from
pinned inputs; normal publication verifies them against the reviewed bundle
hashes. The uncompressed gzip stream avoids recompressing hundreds of already
compressed upstream archives and allows byte-for-byte comparison across the
validated macOS and Linux Python environments.

This is an engineering inventory and a record of unresolved obligations, not a
legal opinion. Obtain license advice for commercial contracts, ownership
questions, or uncertain combinations before relying on them.

## Repeating the checks

```sh
npm ci
npm run licenses:check
npm ci --prefix brand/little-hint-final/source --ignore-scripts
node scripts/licenses.mjs .local/brand-compliance brand/little-hint-final/source
python3 -m venv .local/brand-audit
.local/brand-audit/bin/python -m pip install -r brand/little-hint-final/source/requirements.txt
.local/brand-audit/bin/python scripts/audit-brand.py
```

The build serves `/third-party-notices.txt` without authentication. Production
images also include `/app/LICENSE`, `/app/compliance`, and
`/app/compliance-report`. SPDX image SBOMs are useful inventories, but scanners
can miss libraries embedded inside native binaries. The additional native
version inventory is retained for that reason.

References: [PolyForm Perimeter](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/PolyForm-Perimeter-1.0.0.md),
[Open Source Definition](https://opensource.org/osd),
[LGPLv3](https://www.gnu.org/licenses/lgpl-3.0.html),
[MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/),
[font licensing FAQ](https://openfontlicense.org/ofl-faq/),
and [Sharp's native build sources](https://github.com/lovell/sharp-libvips/tree/ebb95f8add54eee8bed840e3fb587e4cbec857d7).

## Web Push addition

`web-push@3.6.7` is an unmodified MPL-2.0 runtime dependency. The exact npm gitHead source tree is included in `web-push-3.6.7-sources.tar.gz`, with its checksum pinned in the source manifests. Its JavaScript stays external to the application bundle and retains its own license. `http_ece@1.2.0` omits its MIT license from the npm package; the fallback notice comes from its exact published gitHead and is recorded in the notice provenance.

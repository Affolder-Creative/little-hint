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
| Sharp/libvips                          | The `@img/sharp-libvips-*` 1.3.4 binary includes LGPL libraries and other native dependencies | Preserve GPL/LGPL texts and upstream notices; source coverage remains a release blocker below.                                                                                                                                                                                           |
| Lightning CSS                          | MPL-2.0; present in the current production installation through the dependency graph          | Include its notices and corresponding source materials before distributing the image.                                                                                                                                                                                                    |
| axe / Playwright accessibility tooling | MPL-2.0; development/test tooling                                                             | Retain notices in the audit; do not treat use during testing as relicensing the app.                                                                                                                                                                                                     |
| Fraunces font                          | SIL Open Font License 1.1, already included with the original font                            | Keep the font and OFL notice together. The exported logo outlines are artwork, not a replacement font distribution.                                                                                                                                                                      |
| Python brand tools                     | fonttools 4.67.0 under MIT, with external notices; uharfbuzz 0.56.3 under Apache 2.0          | Preserve the tool inventory and bundled notices. They are not installed in the app image.                                                                                                                                                                                                |
| npm brand tools                        | Sharp and Playwright, separately locked                                                       | Audit without running asset generators or changing the original artwork archive.                                                                                                                                                                                                         |
| Alpine runtime                         | Includes copyleft utilities and libraries as well as permissive components                    | Inventory exact packages and aports source revisions; supply required sources alongside image downloads.                                                                                                                                                                                 |
| Node runtime                           | The pinned image supplies Node 24.22.0, including embedded third-party components             | Preserve Node's complete upstream LICENSE and the Docker entrypoint license. The build checks the Node version; base-image updates require matching notices. Unused package managers are removed before copying the final filesystem, so their bytes are absent from distributed layers. |
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

## Outstanding source-material requirements

**The first container release is intentionally blocked.** The repository does
not yet contain a reviewed, checksum-pinned set of corresponding-source archives
for the runtime's copyleft components and bundled native libraries.

The libvips package identifies its component versions and upstream build recipe,
but that is not a complete source bundle. Its recipe also patches components and
updates librsvg's Cargo workspace during the build. Simply attaching a libvips
source tarball or linking to a moving upstream branch would not establish that
all sources match the distributed binary. The source audit must cover those
inputs, patches, and any bundled Rust dependencies too. Alpine sources need
matching APKBUILD recipes and patches for the installed package revisions.

The release job extracts `npm-inventory.json`, `apk-installed.txt` and bundled
native version data from each actual platform image. It produces
`required-sources.json`, then stops before registry publication if any required
component lacks source coverage. Failure artifacts contain that inventory for
review. CI can still validate and merge changes while this work is outstanding.

To complete this requirement:

1. Assemble source archives for the exact distributed components, including
   required build recipes, patches, license notices, and bundled dependency
   sources. Review the relationship between those materials and the binaries.
2. Host the archives at stable HTTPS URLs. Add entries to
   `compliance/source-materials.json`, each with a unique `file` ending in
   `.tar.gz` or `.tar.xz`, `url`, SHA-256 `sha256`, a concrete `review` describing
   what was verified, and a `covers` array of exact identifiers emitted by
   `required-sources.json`.
3. Merge that evidence through a PR and create a new release PR. Source mappings
   are read from the tagged commit, so adding them to main does not silently
   change an earlier draft's audit. An unpublishable initial draft should remain
   unpublished; do not move its tag to another commit.
4. The workflow downloads, verifies, and includes the archives in each platform's
   compliance download before publishing. A changed dependency version or OS
   revision requires updated coverage. Do not replace this check with a blanket
   copyleft allowlist or an empty successful report.

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

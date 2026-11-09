# Web Push 4.0.0 sources

This bundle contains the complete upstream tree at
`2af7b70552d0e2ef99abd69de0f662c88a5aa1f0`, the gitHead published as npm
`web-push@4.0.0`. The source archive includes the MPL-2.0 LICENSE, JavaScript
implementation, package manifest, CLI, and tests. Little Hint uses this library
unmodified and external to its server bundle. Its files retain MPL-2.0; Little
Hint's product license does not restrict those rights.

Extract the upstream archive. The `src/` ESM JavaScript is the preferred source form
and needs no compilation. Install the upstream development dependencies with
npm to run its test script. To replace the library in a Little Hint deployment,
use the modified package through a local npm package dependency, regenerate the
lockfile and notices, and rebuild the image. Preserve its license and make any
modified MPL-covered files available under their original terms when required.

The outer MANIFEST.json records the archive checksum and exact source URL.

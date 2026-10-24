# Web Push 3.6.7 sources

This bundle contains the complete upstream tree at
`8d9ba1b33bfe0d73ccf3606c59ead4287f50e3b8`, the gitHead published as npm
`web-push@3.6.7`. The source archive includes the MPL-2.0 LICENSE, JavaScript
implementation, package manifest, CLI, and tests. Little Hint uses this library
unmodified and external to its server bundle. Its files retain MPL-2.0; Little
Hint's product license does not restrict those rights.

Extract the upstream archive. The `src/` JavaScript is the preferred source form
and needs no compilation. Install the upstream development dependencies with
npm to run its test script. To replace the library in a Little Hint deployment,
use the modified package through a local npm package dependency, regenerate the
lockfile and notices, and rebuild the image. Preserve its license and make any
modified MPL-covered files available under their original terms when required.

The outer MANIFEST.json records the archive checksum and exact source URL.

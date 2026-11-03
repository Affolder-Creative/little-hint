# Caching measurements

## Method

Measured on 2026-10-27 using Node 24.18.0 and an isolated PostgreSQL 18 container
on the development machine. The synthetic fixture contains 1,000 gifts and 1,057
application records. Each read path receives five warm-up calls and 40 timed
samples. The baseline uses the unchanged full-state/world functions that served
import polling before this change; the new paths use the same database and
fixture. Timings include the database round trip and application processing,
but exclude authentication, HTTP, TLS, browser rendering, and production network
latency. Payload sizes are uncompressed JSON.

| Operation | Baseline p50 / p95 | New p50 / p95 | Rows read before / after |
| --- | --- | --- | --- |
| Import-status polling | 3.72 / 7.15 ms | 0.14 / 0.18 ms | 1,057 / 1 |
| Settings lookup | 3.01 / 3.24 ms | 0.15 / 0.18 ms | 1,057 / 20 |

The representative world payload was 1,092,761 bytes; the job response was 201
bytes. During an import, periodic world requests drop from 30 to three per
minute, alongside the small job requests. Regular updates still poll every
20 seconds. Ordinary writes, focus/reconnect, and push events can trigger
additional refreshes. This is a reduction in full-snapshot traffic, not a claim
that the total number of requests falls.

A deterministic textured 1,200 × 800 image produced a 590,588-byte full WebP and
a 48,740-byte 480 × 320 card WebP, about 92% smaller. Real image savings depend
on dimensions and content. Detail views retain the full image.

Importer tests verify that a second account reuses eligible metadata without
another retailer fetch, successful enrichment avoids repeated paid calls, and
photo-enabled imports still create separate media records. No live retailers or
paid services were used in the benchmark or tests. Cache-hit rates and production
latency have not been measured.

## Repeat the benchmark

Create a disposable PostgreSQL database named `little_hint_benchmark`. The script
refuses other database names and refuses to populate a nonempty database. It
adds synthetic application records, removes them on completion, and uses a
temporary image directory. It leaves the additive schema in place.

```sh
DATABASE_URL=postgres://USER:PASSWORD@localhost:PORT/little_hint_benchmark \
  npx tsx scripts/benchmark-cache.ts
```

Use the emitted JSON for comparisons on the same machine and dataset. The script
contains no provider calls. For release validation, run the integration suite,
the `caching` browser suite, and built-PWA/privacy workflows on synthetic staging
data before production rollout.

## Device image cache validation, 2026-10-31

The isolated Chromium and WebKit test downloads a synthetic image once, deduplicates concurrent requests, and reloads the page with IndexedDB retained. The reload transfers zero additional image responses. A second account downloads independently. Tests also verify revoked access, disabled caching and cross-tab clearing. Run `npm run test:images:browser` with Playwright Chromium and WebKit installed. These are deterministic request-count checks, not production latency measurements.

## Compact snapshots and history, 2026-11-03

The current browser requests `X-Little-Hint-World: compact`. That response keeps
active reservations and resumable imports, omits completed import history and
cancelled reservations, and sends each authorized gift projection once. The
browser joins active reservations to the already-authorized items by ID. Requests
without this header retain the legacy response for older clients.

Buying loads contributions from `/api/v1/buying/contributions` and cancelled
reservations from `/api/v1/buying/cancelled`. Each page defaults to 50 records,
with a maximum of 100. The opaque `nextCursor` is passed back as the URL-encoded
`cursor` query parameter. Ordering uses descending creation time and ID. Every
request authenticates and filters for the current buyer/contributor; cursors do
not grant access. Cancelled history is fetched only while its disclosure is open.
These reads load buying-related records instead of the full application state.

Run the synthetic benchmark without a database or provider calls:

```sh
node --import tsx scripts/benchmark-world.ts
```

On Node 24.18.0, five warmups and 40 samples of 1,000 visible gifts, 1,000 historical
imports, 950 cancelled reservations, and 50 active reservations produced:

| Projection | Uncompressed bytes | p50 / p95 processing time |
| --- | ---: | ---: |
| Legacy world | 3,906,380 | 23.58 / 32.46 ms |
| Compact world | 1,401,100 | 10.70 / 11.86 ms |
| First cancelled-history page | 13,818 | 0.14 / 0.18 ms |

The recurring payload is 64.1% smaller for this fixture. Timings exclude database
reads, authentication, transport, and rendering. Active gift collections still
use the world snapshot and its 20-second refresh interval. This change does not
remove the full-state transaction design; larger installations should use the
measurements below to decide when to paginate active gift collections or change
storage.

## Operational measurements

An authenticated administrator can request `/api/v1/admin/metrics`. Responses are
`no-store`; non-administrators receive 403 and signed-out requests receive 401.
The endpoint provides:

- Request counts, 5xx counts, and latency histograms grouped by registered route
  template and method. No account IDs, request bodies, URLs, or query strings are
  recorded. At most 200 template/method groups plus an overflow group are kept.
- App transaction duration and advisory-lock wait histograms in milliseconds.
  Transaction durations include pool acquisition and failed transactions. Lock
  wait measures the database lock statement through acquisition.
- Worker transaction/lock histograms sampled once per minute into a fixed set of
  numeric usage records. `worker.sampledAt` indicates freshness. Process counters
  reset on restart; compare `startedAt` before calculating interval deltas.
- Pending/running import and discovery counts, pending standalone notifications
  and wish-list batches, and the age in seconds of each oldest application
  record. These are application-outbox ages, not pg-boss scheduling delays. The
  import count excludes discarded/saved drafts.
- Total PostgreSQL database bytes and upload file count/bytes, including card
  renditions. Storage probes are shared across concurrent requests and cached for
  one minute. Upload scans cover regular files in the upload directory, ignore
  symlinks and subdirectories, and tolerate files removed during cleanup.

Histogram bucket counts are cumulative at 1, 5, 10, 25, 50, 100, 250, 500, 1,000,
and 5,000 ms. `count` includes slower samples. Track interval deltas for rate and
latency distributions, increasing lock waits under simultaneous writes, sustained
queue age growth, and storage growth against the host's available disk capacity.
App request metrics are per process, and worker snapshots represent the last
reporting worker; multi-replica fleet aggregation requires external monitoring.

## Static-server dependencies

`@fastify/static` currently declares glob 13. A scoped npm override selects glob
14.0.3 and its patched minimatch dependency, retaining Fastify 5 compatibility.
This addresses [glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
and [minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)
without downgrading the static-server plugin. Static-delivery regressions cover
both wildcard and enumerated routes, nested assets, ETags, missing files, and
explicit dotfile exclusion. Remove the override when the plugin's declared
range includes patched versions. `npm audit --omit=dev` reports zero findings
with this lockfile as of 2026-11-03.

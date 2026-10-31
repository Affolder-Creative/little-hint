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

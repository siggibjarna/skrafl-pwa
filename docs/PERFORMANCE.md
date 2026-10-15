# Performance

## Budgets, not measurements

`npm run size` recursively gzips production JavaScript files individually and
reports the sum. It includes the search worker and service-worker JavaScript;
it excludes dictionary data, CSS, images, and HTML. Above **150 KiB (153,600
bytes)** it emits a CI warning, not a failing budget assertion.
This is a reproducible bundle diagnostic, not total transfer size.

The desktop observations below are measurements, not performance budgets or
device-independent guarantees. Upstream's historical Python timing figures are
not measurements of this port.

## Measured desktop results — 2026-10-15

Production build based on commit
`23b0a2c4dd588898fe4e813003c13a24dfe46f65` plus the then-uncommitted DAWG
validation and UI corrections. The measured build is identified by
`assets/index-BLs3Uruu.js` and `assets/engine-worker-q75AYGvg.js`; the commit
alone does not identify those corrections.

Environment: headless Chromium **154.0.8037.0**, Linux
**6.17.0-1022-azure x86_64**, shared runner reporting **4 vCPUs**, AMD EPYC
**7763**. A fresh browser profile loaded `npm run build` output through
`npm run preview -- --host 0.0.0.0` at `/skrafl-pwa/`. Browser interaction and
offline emulation used Chromium's DevTools Protocol. No explicit CPU or network
throttling was applied; host power mode was not recorded. Shared-runner load and
the small sample sizes limit comparisons.

The page's `engine-parse` and `engine-search` Performance entries supplied these
durations. Parsing includes graph validation. A first, cold worker parsed the
dictionary once in **1,223.5 ms**; its first `afi` search took **28.2 ms**
(one sample each). Subsequent searches reused that worker and parsed graph:

| Input | Warm samples | Search median (ms) | Search p95 (ms) | Words | Additional-letter words |
| --- | ---: | ---: | ---: | ---: | ---: |
| `afi` | 5 | 5.2 | 6.6 | 4 | 35 |
| `skrafl` | 5 | 45.5 | 76.1 | 64 | 32 |
| `af??` | 5 | 27.9 | 35.6 | 892 | 0 |
| `=?ex?` | 5 | 0.3 | 0.5 | 17 | 0 |
| `=????` | 5 | 40.6 | 81.7 | 8,017 | 0 |

P95 uses nearest rank, so it is the maximum of only five samples, not a stable
tail-latency estimate. These are engine durations, excluding download,
message delivery, rendering, and input-to-paint time. Dictionary transfer/cache
timing was not measured; a fresh profile does not establish whether the first
worker fetch raced or reused service-worker precaching.

The real dictionary recorded by [dictionary.lock.json](../dictionary.lock.json)
had SHA-256
`d5d7b3faa290e1796008f878798f6b7d8a3d5c86ac1d8a688dec5d89da6a7202`:

| Payload measurement | Bytes |
| --- | ---: |
| Raw text DAWG | 3,963,832 |
| Local gzip (`node:zlib.gzipSync`, default settings) | 1,618,768 |

These are file/compression sizes, **not measured HTTP transfer bytes** or heap
usage. Reliable worker-inclusive memory was not measured.

### Recorded browser/offline verification

The same build passed 53 browser assertions covering initial/help UI, explicit
Enter/button search, rack/wildcard/pattern results, word links and Back,
preserved positional filters, multiset contains, and counts in both lists.
CacheStorage contained the content-hashed real DAWG, dictionary manifest,
application shell, and search-worker JavaScript; a reloaded page was controlled
by the service worker.

After clearing the HTTP cache and enabling offline mode, a full reload started
a new worker and returned 130 `afi?` words; a subsequent offline `skrafl` search
returned 64 words and 32 additional-letter words. A stronger check then stopped
the preview server (confirmed connection refused), cleared the HTTP cache again,
and navigated to `?rack=afi` while offline: the cached shell and a new worker
loaded successfully and returned four words. That worker's cached-dictionary
parse took **1,117.7 ms** (one sample); total offline startup time was not measured.

A 390 × 844 viewport emulation showed no horizontal page overflow. This is
**not an iPhone measurement**. No physical iPhone/Safari, installed-iOS,
Lighthouse, complete input-to-paint, or worker-memory result is claimed.

## Design choices

- Dictionary download and text-graph parsing are deferred to the first search.
  The service worker may already have fetched the bytes for offline use.
- Parsing and graph navigation run off the main thread.
- The parsed graph is retained in a live worker; a cancelled worker loses it.
- Filters run on existing results after a short debounce, without repeated
  dictionary traversal.
- Content-addressed dictionary filenames let the service worker version
  dictionary data alongside application code.

A text DAWG still needs decoded text and graph objects in memory. The payload
byte count is not a heap-size estimate. Broad wildcard patterns and large
result sets can be expensive, and rendering all returned words is not
equivalent to a virtualized list. A worker keeps graph traversal off the UI
thread; it does not make every search or render constant-time.

## Reproducible measurement procedure

1. Record commit SHA, dictionary lock, browser/version, OS, hardware, power mode,
   and any CPU/network throttling.
2. Run `npm ci`, `npm run build:dict`, `npm run build`, and `npm run size`.
   Preserve the actual size output with the run, not a guessed number.
3. Serve the production build using `npm run preview`. Development and mock
   mode are not production performance measurements.
4. Use a fresh browser profile for a cold load. Record download size/time and
   first search separately from later searches on the same worker.
5. Search representative ordinary racks, two-blank racks, and patterns.
   Include at least one broad wildcard pattern and note result counts.
6. Inspect Performance entries `dictionary-parse` and `search` in the worker,
   or the returned `engine-parse` and `engine-search` measures on the page.
   They are engine durations, not network or complete input-to-paint timing.
7. Record input-to-next-paint separately using the browser Performance panel.
   Collect repeated runs and report sample count and percentiles.
8. Inspect heap usage separately, including the worker. Verify slow-device
   behavior rather than extrapolating from desktop results.
9. Wait for service-worker installation, reload under its control, then disable
   the network and repeat startup/search. Test update acceptance and failure/
   retry paths. Repeat in an installed iOS app, whose storage may differ from
   Safari's tab storage.

CI size output supplies build evidence only. Browser offline, responsiveness,
and accessibility checks require their own recorded results; they should not be
reported as passing merely because a production build succeeded.

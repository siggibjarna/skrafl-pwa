# Performance

## Budgets, not measurements

`npm run size` recursively gzips production JavaScript files individually and
reports the sum. It includes the search worker and service-worker JavaScript;
it excludes dictionary data, CSS, images, and HTML. Above **150 KiB (153,600
bytes)** it emits a CI warning, not a failing budget assertion.
This is a reproducible bundle diagnostic, not total transfer size.

No device-specific parse time, search latency, memory usage, offline startup
time, or Lighthouse score is claimed here. Upstream's historical Python timing
figures are not measurements of this port.

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

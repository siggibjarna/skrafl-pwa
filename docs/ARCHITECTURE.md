# Architecture

## Runtime

```text
Lit UI ── typed request/id ──> EngineClient ──> module Web Worker
                                                    │
                                      dict-manifest.json + text DAWG
                                                    │
                                      Dawg → processInput → result
```

- `src/engine/alphabet.ts`: explicit Icelandic ordering, tile values, and
  multiset operations; dictionary order does not depend on browser locale.
- `src/engine/dawg.ts`: parser and navigators for upstream's compressed-edge
  **text** DAWG. The published payload is not a custom binary format.
- `src/engine/tabulator.ts`: rack/pattern normalization, search, scoring,
  best-score ties, validity, and added-letter combinations.
- `src/worker/`: typed request/response boundary, deferred dictionary loading,
  worker-local parsed graph, status reporting, timing, and retry.
- `src/ui/`: Lit views and client-side filters. Filtering does not change engine
  results or issue new dictionary searches.

The worker loads and parses the dictionary on the first query and reuses it
while alive. When a request is superseded, the client terminates the previous
worker so expensive synchronous graph traversal cannot block a newer request.
Request IDs also prevent late results replacing current state. Retry starts a
fresh worker. A terminated worker must load/parse its graph again.

The UI uses semantic forms, labeled filters, a native help dialog, keyboard
focus styles, and live status/count messages. Rack queries are encoded into
browser history; there is no backend query API, account, or server-side rack
storage. Hosting still receives ordinary asset requests.

## Dictionary production and provenance

`scripts/build-dictionary.sh` runs the Python builder. The default build reads
`dictionary.lock.json` with `upstreamSha`, `sha256`, `bytes`, and `builtAt`.
Downloaded inputs are cached in `.cache/upstream/`; the upstream builder
produces the DAWG from its full word list plus additions and removals.

Production output in `public/dict/` includes `dict-manifest.json` and an
`ordalisti.<sha256>.text.dawg` payload. Its content-addressed name changes with
dictionary content. The lock's hash and byte length verify reproducibility;
`builtAt` is provenance metadata, not part of the dictionary bytes.
Generated dictionary assets and caches are ignored by Git.

`npm run build:mock` produces a separate, small developer-only dictionary under
`public/mock/`. Only Vite mock mode selects it. Production and differential
verification use the real dictionary.

## Offline lifecycle

Vite's PWA integration generates the manifest and Workbox service worker.
The application shell, worker assets, and production dictionary are precached.
Dictionary requests are excluded from navigation fallback, so a missing DAWG
cannot silently become an HTML page. The maximum individual precache asset
size is configured explicitly rather than relying on Workbox's small default.

The new service worker waits and exposes an update action to the UI. Accepting
it activates the new version and reloads; it does not silently swap an in-memory
DAWG during a running query. Old service-worker caches are cleaned up.
No IndexedDB application database is required.

An initial online visit must finish caching before offline use. Cache Storage
is best-effort browser storage and can be evicted. Safari and iOS Home Screen
installations may use separate stores: each must be initialized online.

## Automation and privilege boundaries

CI uses Node 24 and Python 3.11. Dictionary cache keys contain the upstream SHA
and builder/lock hashes; fixture cache keys contain the upstream SHA and Python
generator hash. No fallback key restores fixtures for a different revision.
The default dictionary build verifies locked outputs even after a cache hit.

Dictionary sync starts from a trusted `main` snapshot in a **read-only** job.
It obtains the latest upstream commit touching `resources/`, builds a candidate,
and runs unit and full Python differential checks plus lint/type/build/size
checks. That job has no repository-write token exposed to upstream Python.
A separate job validates and writes only the resulting lock, checks that
`main` still equals the verified base, and performs a non-force push. Concurrent
main changes fail safely rather than being rebased without revalidation.

The successful writer outputs the exact new commit SHA to the reusable Pages
workflow. That workflow checks the revision against current `main`, rebuilds
and verifies it read-only, uploads a Pages artifact, and rechecks main before
deployment. Only the artifact deployment job has `pages: write` and
`id-token: write`; it never checks out or executes pull-request code.
Dictionary syncs and Pages deployments each have serialized concurrency groups.
Failure reporting is isolated in an issue-writer job with bounded logs.

No workflow uses `pull_request_target`, automatically merges a PR, or gives
fork pull-request code a write token. Branch protections and Pages environment
policies remain authoritative and may intentionally block automation.

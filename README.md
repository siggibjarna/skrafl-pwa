# Skraflhjálp PWA

An offline-first Icelandic word-game helper, porting the engine of
[Vilhjálmur Þorsteinsson's Skraflhjálp](https://github.com/vthorsteinsson/Skrafl)
to TypeScript. Lit renders the interface; a Web Worker searches the real upstream
DAWG dictionary. There is no application server.

Pages URL after deployment: https://siggibjarna.github.io/skrafl-pwa/

**Rights notice:** upstream source is public but has no explicit license grant.
Permission for this port and redistribution remains unresolved. Public availability
is not permission. See [ATTRIBUTION.md](ATTRIBUTION.md) before publishing or
redistributing either source or dictionary data.

## Use

- Enter rack letters; `?`, `_`, and `*` represent blank tiles (at most two in rack mode).
- Prefix a pattern with `=`, for example `=h??t?r`, to match exact positions and length.
- Results show tile scores, highest-scoring words, anagrams, and words of seven
  or more letters.
  Rack mode without blanks also offers words made by adding one letter.
- Filter both result lists by length, fixed positions, or required letters.
  Position fields expand as you type; repeated required letters require repeated
  occurrences.
- Click a word to search it. Queries use `?rack=…`, so links and browser Back/Forward work.
  The help dialog explains the Icelandic controls and credits.
- Double-tap zoom is suppressed to avoid accidental zooming during quick taps;
  pinch-to-zoom remains available.

Scores are letter totals, not a board solver: premium squares, crossing words,
and turn-level bonuses are not included.

## Development

Use **Node.js 24**, npm, and **Python 3.11**.

```sh
npm ci
npm run build:dict
npm run dev
```

The dictionary build downloads pinned upstream resources on first use, verifies
their provenance and the lock, and writes `public/dict/`. Subsequent builds reuse
downloaded inputs under `.cache/upstream/`. The real dictionary is not committed.

For a fast, deliberately incomplete development dictionary:

```sh
npm run dev:mock
```

Mock mode reads `public/mock/`, not the production dictionary. It is not suitable
for parity checks or publication.

### Verification

```sh
npm run typecheck
npm run lint
npm run build:mock
npm test
npm run build:dict
ROOT="$PWD"
SHA="$(node -p 'JSON.parse(require("fs").readFileSync("dictionary.lock.json", "utf8")).upstreamSha')"
(cd ".cache/upstream/Skrafl-$SHA" && python "$ROOT/tests/differential/generate.py" "$ROOT/.cache/differential.json")
REQUIRE_DIFFERENTIAL=1 npm run test:differential
npx playwright install webkit
npm run test:ui
npm run size
npm run preview
```

The Python fixture generator runs **inside the pinned upstream directory**, with
an absolute output path. It uses upstream Python directly, not the TypeScript
engine. Without fixtures, local differential tests may skip; setting
`REQUIRE_DIFFERENTIAL=1` makes missing fixtures an error, as in CI.

`npm run test:ui` builds the production PWA and runs the mobile WebKit tests with
an iPhone 16 Pro-sized viewport and touch input. The tests check layout geometry
instead of platform-dependent screenshot baselines and save screenshots and
traces on failure. Install WebKit with `npx playwright install webkit` first.
These tests do not reproduce the iOS keyboard, Home Screen lifecycle, safe areas,
or real pinch and double-tap gestures.

### iPhone PWA smoke test

After touch or layout changes, periodically check the installed Home Screen app
on an iPhone 16 Pro or newer:

1. Open it online, install any offered update, and search for `stafir`.
2. Check that the search label fits, `?` inserts at the caret without dismissing
   the keyboard, `✕` clears the rack, and `=` alone retains its selected state.
3. Double-tap the page and controls: the page should not zoom. Pinch in and out
   to confirm zoom still works; also check scrolling and the length sliders.
4. Change the length range and type multiple letters in both position filters.
   Check their sizing, result spacing, clearing, and filter restoration on reload.
5. Once the app is cached, turn on airplane mode, reopen the Home Screen app,
   and search for `hús`. Restore connectivity afterward.

## Installation and offline use

Production assets are built for `/skrafl-pwa/`. On GitHub Pages, set **Settings →
Pages → Build and deployment → Source: GitHub Actions**. A custom repository path
also requires changing Vite's base, manifest start URL, and scope together.

Visit online and allow the service worker to finish caching the application and
dictionary before relying on offline operation. On iPhone/iPad, use Safari's
**Share → Add to Home Screen**. On iOS, the Home Screen installation has separate
storage from Safari, so its first launch downloads the dictionary again: open
the installed app online once too. Browser/OS storage
eviction, private browsing, and clearing site data can remove offline content.
Offline availability is not guaranteed indefinitely.

Updates wait for the **Ný útgáfa tiltæk** button instead of reloading an active
search automatically. Dictionary files are content-addressed and updated with the
application's service-worker cache.

## Automation

- **CI:** pushes and pull requests run clean npm installation, type checking,
  lint, unit tests, pinned dictionary verification, cached Python oracle
  generation, full differential tests, mobile WebKit tests of the production
  build, and JavaScript gzip size reporting. Failed mobile tests upload screenshots
  and traces. CI has read-only repository access.
- **Dictionary sync:** weekly on Monday at 05:23 UTC, or manually on `main`.
  It compares the latest upstream commit touching `resources/` with
  `dictionary.lock.json`, builds the candidate, and runs the complete checks,
  including mobile WebKit tests.
  Only a passing candidate's lock is committed; there is no PR auto-merge.
  A separate writer job refuses to overwrite a changed `main` and uses a
  non-force push. Failure creates an issue with bounded diagnostic output.
- **Pages:** runs on `main` pushes and as a reusable workflow. Sync explicitly
  passes the exact newly committed SHA because a `GITHUB_TOKEN` push does not
  trigger another push workflow. Deployment rejects stale/non-main revisions,
  builds an artifact with read-only permissions, and grants Pages/OIDC write
  permissions only to the deployment job.
- **Dependabot:** weekly npm and official Actions update proposals; review and
  merge them normally.

Actions are pinned to release commit SHAs. Their current major releases and
advisory status were checked during implementation; future updates still need
review. Branch protections may prevent the sync bot's direct push; in that case
the workflow fails rather than bypassing protections.

## Further reading

- [Architecture](docs/ARCHITECTURE.md)
- [Behavioral parity and deliberate presentation changes](docs/PARITY.md)
- [Performance budgets and measurement procedure](docs/PERFORMANCE.md)
- [Attribution, data terms, and trademark notice](ATTRIBUTION.md)

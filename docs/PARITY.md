# Behavioral parity

## Oracle boundary

The target is the pinned upstream Python engine with the web input boundary:
Unicode **NFC**, then truncation to **15 Unicode code points**, then upstream
`Tabulator.process`. The core engine deliberately follows Python whitespace
stripping and explicit Icelandic case conversion rather than JavaScript's
broader locale-dependent behavior.

`tests/differential/generate.py` imports upstream `languages` and
`skraflpermuter` from its working directory. It records expected values as JSON;
the differential test deep-compares complete TypeScript results:

- success/error and normalized/display rack;
- ordered words **and individual scores**;
- high score and all tied highest words in order;
- added-letter groups, their order, words, and scores;
- validity of the original rack.

Generation uses a fixed random seed and includes handpicked boundary cases,
random racks sampled from the real tile bag, and patterns sampled from actual
dictionary words. This is differential coverage, not a proof for every input.
The generated set contains over 2,000 cases by default; use the generator's
reported count rather than assuming a permanently fixed fixture count.

## Preserved behavior

- Icelandic alphabet ordering and tile values are explicit.
  Upstream's secondary Latin-1 sort-key rotation is retained, including the
  unusual keys for uppercase `Ö` and lowercase `ö`; it is not replaced with
  `Intl.Collator` or ordinary Unicode ordering.
- `?`, `_`, and `*` normalize to blanks. Rack mode rejects more than two;
  exact-pattern mode can use more.
- A leading `=` selects exact-length pattern matching; it counts toward the
  15-code-point web limit. Internal whitespace is not removed by the engine.
  A bare `=` succeeds with an empty pattern and no returned words.
- Rack results are ordered by descending length, then Icelandic order.
  Pattern matches are ordered alphabetically.
- Blank tiles score zero in rack mode. Pattern wildcard matches receive the
  matched word's ordinary letter score, as upstream does.
- Highest-score ties are retained. No board-premium or bingo bonus is added.
- Rack validity tests dictionary membership and is not inferred from whether
  the list contains any results.
- Added-letter combinations appear only for ordinary racks without blanks.
  They use the full rack plus one extra letter and retain upstream group/word
  ordering and scores.
- Short, empty, invalid, upper-case, decomposed-Unicode, and truncation cases
  are exercised alongside compressed-edge DAWG navigation.

## Intentional presentation differences

The engine preserves upstream's pattern display rack exactly: **`"= "` followed
by the normalized pattern**. For example, `=h??t?r` returns a rack beginning
`= h…`. The clickable original-query chip removes that display-only space both
on screen and from the next submitted query. This corrects a presentation
round-trip issue without changing the oracle contract.

The UI passes the original entered query to the worker unchanged; it only uses
a trimmed copy to detect an empty submission. NFC normalization and
truncate-before-strip therefore happen at the same engine boundary for UI and
direct calls. Browser input length enforcement still differs from a
code-point-aware engine limit for non-BMP characters; the engine remains the
authoritative validation layer.

Validity and anagram presentation do not treat the decorated `"= "` display
rack as literal tiles. Rack searches use the engine's `valid` result. Patterns
retain `valid: false` in engine output; the UI adds a tick for a literal pattern
when its undecorated text occurs among the returned exact matches. Anagram
coloring compares word length with the normalized rack/pattern length after removing the
display prefix and space, unlike the legacy template's raw display-string
length comparison. Thus a short full-pattern match can receive anagram coloring
whether or not the pattern has a validity tick. Seven-or-more-letter coloring
takes precedence. These are presentation rules, not changes to engine results.

The PWA replaces server-rendered pages with Lit, browser history, a worker,
offline assets, retry/status messages, and a user-confirmed update prompt.
Length, fixed-position, and required-letter filters are presentation-only and
apply to both lists without rerunning the engine. Required letters have multiset
semantics; filtering preserves engine ordering and the original highest score.
Visual emphasis for words of seven or more letters and anagrams is not a change
to scoring.

## Running the contract

```sh
npm run build:dict
ROOT="$PWD"
SHA="$(node -p 'JSON.parse(require("fs").readFileSync("dictionary.lock.json", "utf8")).upstreamSha')"
(cd ".cache/upstream/Skrafl-$SHA" && python "$ROOT/tests/differential/generate.py" "$ROOT/.cache/differential.json")
REQUIRE_DIFFERENTIAL=1 npm run test:differential
```

CI caches fixtures by upstream revision **and generator hash**, refuses missing
fixtures, and runs the entire generated suite. Weekly sync generates fresh
fixtures against each candidate and must pass before committing the lock.
Mock dictionary tests complement these checks but do not establish production
dictionary parity.

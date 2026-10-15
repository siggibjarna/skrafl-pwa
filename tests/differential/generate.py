#!/usr/bin/env python3
"""Run from the pinned upstream directory: python /path/to/generate.py OUTPUT."""

import argparse
import json
from pathlib import Path
import random
import sys
import unicodedata

# Wordbase intentionally resolves resources relative to the upstream working directory.
sys.path.insert(0, str(Path.cwd()))
from languages import Alphabet
from skraflpermuter import Tabulator


HANDPICKED = [
    "", " ", "\t\n", "a", "A", "á", "Á", "ö", "Ö", "?", "_", "*",
    "??", "?_", "**", "???", "a???", "a__*", "=", "=a", "=?", "=_",
    "=*", "==", "=??", "=???", "=h??t?r", "=H**T_R", "=hestur",
    "hestur", "HESTUR", "Hestur", "hest?", "hest_", "hest*", "?estur",
    "h?st?r", "h__tur", "h**tur", "hest", "hestar", "hests", "hesti",
    "skrafl", "SKRAFL", "íslenska", "ÍSLENSKA", "þrá", "ÞRÁ", "ævi",
    "ÆVI", "ár", "ÁR", "úr", "ÖX", "þú", "jökull", "straumur",
    "aaaaaaa", "zzzzzzz", "xxyýþæö", "aábdðeé", "fghiíjk", "lmnoópr",
    "stuúvxy", "ýþæö", " a ", "\thestur\n", "hest ur", "hest\tur",
    "c", "C", "q", "Q", "w", "W", "z", "Z", "123", "hestur!",
    "a-b", "a=b", "a.b", "🙂", "a🙂", "\ufeffhestur", "a\u200bb",
    "a\u0301r", "A\u0301R", "o\u0308x", " \u00a0ÁR\u00a0 ",
    "\u001cár\u001f", "a\u0300", "hestur " * 3,
    "abcdefghijklmnop", "a" * 15, "a" * 16, "a" * 15 + "!",
    "=" + "a" * 14 + "!", " " * 15 + "ár", "hestur" + " " * 10 + "!",
    "= " , "=hestur ", " =hestur", "=ár", "=ÁR", "=a_",
    "afi", "orðabók", "þjóðin", "rrssttu", "ÞjÓð", "ska?", "ska_",
    "ska*", "a??", "ab???", "=????", "=?ex?", "=sk?fl", "=" + "?" * 15,
    "skraflw", "abc1", "á b", "b", "   ",
]


def expected(input_text):
    # This is the public web boundary, not an alternative implementation of the oracle.
    rack = unicodedata.normalize("NFC", input_text)[:15]
    tab = Tabulator()
    ok = tab.process(rack)
    error = None
    if not ok:
        stripped = rack.strip()
        if not stripped:
            error = "Sláðu inn stafi."
        else:
            query = stripped[1:] if stripped.startswith("=") else stripped
            invalid = any(
                (Alphabet.lowercase(c) if c in Alphabet.upper else c)
                not in Alphabet.scores
                and c not in "?_*"
                for c in query
            )
            error = (
                "Ógildur stafur."
                if invalid
                else "Að hámarki má nota tvö jokertákn."
            )
    return {
        "ok": ok,
        "error": error,
        "rack": tab.rack() if ok else rack,
        "words": [{"word": word, "score": score} for word, score in tab.allwords()],
        "highscore": tab.highscore(),
        "highwords": tab.highwords(),
        "combinations": [
            {
                "letter": letter,
                "words": [{"word": word, "score": tab.score(word)} for word in words],
            }
            for letter, words in (tab.combinations() or [])
        ],
        "valid": bool(ok and not tab._pattern and tab.is_valid_word(tab._rack)),
    }


def random_inputs(rng, count):
    bag = Alphabet.full_bag().replace("?", "")
    for index in range(count * 4 // 5):
        # Deliberately cover zero, one and two blanks rather than hoping to draw them.
        blanks = 2 if index % 10 == 0 else 1 if index % 10 in (1, 2) else 0
        tiles = rng.sample(bag, rng.randint(2, 8) - blanks) + ["?"] * blanks
        rng.shuffle(tiles)
        rack = "".join(tiles)
        if rng.random() < 0.12:
            rack = rack.upper()
        if rng.random() < 0.10:
            rack = rack.replace("?", rng.choice("_*"))
        yield rack
    # Reservoir-sample real source words, then mask positions to exercise compressed edges.
    sample = []
    seen = 0
    with Path("resources/ordalisti.full.sorted.txt").open(encoding="utf-8") as stream:
        for line in stream:
            word = line.strip()
            if not 2 <= len(word) <= 8:
                continue
            seen += 1
            if len(sample) < 1000:
                sample.append(word)
            else:
                index = rng.randrange(seen)
                if index < len(sample):
                    sample[index] = word
    for _ in range(count - count * 4 // 5):
        word = list(rng.choice(sample))
        for index in rng.sample(range(len(word)), rng.randint(0, min(3, len(word)))):
            word[index] = rng.choice("?_*")
        pattern = "".join(word)
        yield "=" + (pattern.upper() if rng.random() < 0.2 else pattern)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seed", type=int, default=20261015)
    parser.add_argument("--count", type=int, default=2000)
    args = parser.parse_args()
    if args.count < 0:
        parser.error("--count must be nonnegative")
    inputs = HANDPICKED + list(random_inputs(random.Random(args.seed), args.count))
    fixtures = []
    for index, input_text in enumerate(inputs):
        fixtures.append({"input": input_text, "expected": expected(input_text)})
        if (index + 1) % 100 == 0:
            print(f"Generated {index + 1}/{len(inputs)} fixtures", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(fixtures, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(fixtures)} upstream oracle fixtures to {args.output}")


if __name__ == "__main__":
    main()

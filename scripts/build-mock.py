#!/usr/bin/env python3
"""Build a deterministic small development dictionary using the upstream builder."""

import importlib.util
from pathlib import Path
import random
import sys

spec = importlib.util.spec_from_file_location(
    "dictionary_build", Path(__file__).with_name("build-dictionary.py")
)
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def main():
    source = pipeline.ensure_upstream()
    sys.path.insert(0, str(source))
    from dawgbuilder import DawgBuilder, filter_skrafl
    from languages import Alphabet

    resources = source / "resources"
    removed = set((resources / "ordalisti.remove.txt").read_text(encoding="utf-8").split())
    rng = random.Random(20261015)
    sample = []
    count = 0
    for name in ("ordalisti.full.sorted.txt", "ordalisti.add.txt"):
        with (resources / name).open(encoding="utf-8") as words:
            for line in words:
                word = line.strip()
                if not word or word in removed or not filter_skrafl(word):
                    continue
                count += 1
                if len(sample) < 2000:
                    sample.append(word)
                else:
                    index = rng.randrange(count)
                    if index < 2000:
                        sample[index] = word
    words = sorted(set(sample), key=Alphabet.sortkey)
    work = pipeline.CACHE / "mock"
    work.mkdir(parents=True, exist_ok=True)
    (work / "sample.txt").write_text("\n".join(words) + "\n", encoding="utf-8")
    DawgBuilder().build(["sample.txt"], "ordalisti", str(work))
    manifest = pipeline.publish(work / "ordalisti.text.dawg", pipeline.ROOT / "public" / "mock")
    print(f"Mock: {len(words)} words, {manifest['bytes']} bytes, sha256={manifest['sha256']}")


if __name__ == "__main__":
    main()

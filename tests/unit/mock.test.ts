import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareWords } from '../../src/engine/alphabet';
import { Dawg } from '../../src/engine/dawg';

const directory = resolve('public/mock');
const manifestPath = resolve(directory, 'dict-manifest.json');
const generated = existsSync(manifestPath);

describe.skipIf(!generated)('upstream-built seeded mock dictionary', () => {
  let text: string;
  let dawg: Dawg;
  let sample: string[];
  let manifest: { file: string; sha256: string; bytes: number };
  if (generated) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest;
    text = readFileSync(resolve(directory, manifest.file), 'utf8');
    dawg = new Dawg(text);
    sample = readFileSync(resolve('.cache/upstream/mock/sample.txt'), 'utf8')
      .trim().split('\n');
  }

  it('publishes a content-addressed, checksum-verified manifest', () => {
    expect(manifest.file).toBe(`ordalisti.${manifest.sha256}.text.dawg`);
    expect(Buffer.byteLength(text)).toBe(manifest.bytes);
    expect(createHash('sha256').update(text).digest('hex')).toBe(manifest.sha256);
  });

  it('loads every sorted seeded source word', () => {
    expect(sample.length).toBeGreaterThanOrEqual(1900);
    expect(sample.length).toBeLessThanOrEqual(2100);
    expect([...sample].sort(compareWords)).toEqual(sample);
    expect(new Set(sample).size).toBe(sample.length);
    for (const word of sample) expect(dawg.find(word), word).toBe(true);
    expect(dawg.find('not-an-icelandic-word')).toBe(false);
  });

  it('enumerates exactly the upstream-builder sample through pattern traversal', () => {
    const words = Array.from({ length: 15 }, (_, index) => dawg.match('?'.repeat(index + 1)))
      .flat().sort(compareWords);
    expect(words).toEqual(sample);
  });

  it('returns the same permutation set as the seeded source', () => {
    for (const rack of sample.filter((word) => word.length <= 8).slice(0, 20)) {
      const expected = sample.filter((word) => {
        let remaining = rack;
        for (const letter of word) {
          if (!remaining.includes(letter)) return false;
          remaining = remaining.replace(letter, '');
        }
        return true;
      }).sort((left, right) => right.length - left.length || compareWords(left, right));
      expect(dawg.permutations(rack), rack).toEqual(expected);
    }
  });
});

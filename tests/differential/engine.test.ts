import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Dawg } from '../../src/engine/dawg';
import { processInput, type SearchResult } from '../../src/engine/tabulator';

interface Fixture { input: string; expected: SearchResult }

const fixturePath = resolve(
  process.env.DIFFERENTIAL_PATH ?? process.env.DIFFERENTIAL_FIXTURES ?? '.cache/differential.json',
);
const manifestPath = resolve(process.env.DICTIONARY_MANIFEST ?? 'public/dict/dict-manifest.json');
const generated = existsSync(fixturePath);
if (!generated && process.env.REQUIRE_DIFFERENTIAL === '1') {
  throw new Error(`Required Python oracle fixtures are missing: ${fixturePath}`);
}

describe.skipIf(!generated)('pinned upstream Python oracle', () => {
  let dawg: Dawg;
  let fixtures: Fixture[] = [];
  if (generated) {
    const dictionaryPath = process.env.DICTIONARY_PATH
      ? resolve(process.env.DICTIONARY_PATH)
      : resolve(manifestPath, '..', JSON.parse(readFileSync(manifestPath, 'utf8')).file as string);
    dawg = new Dawg(readFileSync(dictionaryPath, 'utf8'));
    fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture[];
    if (fixtures.length === 0) throw new Error('Python oracle fixture set is empty');
  }
  it.each(fixtures)('matches upstream for $input', ({ input, expected }) => {
    expect(processInput(input, dawg)).toEqual(expected);
  });
});

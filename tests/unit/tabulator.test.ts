import { describe, expect, it } from 'vitest';
import { Dawg } from '../../src/engine/dawg';
import { processInput } from '../../src/engine/tabulator';

const dawg = new Dawg('a:2_á|r:0_ba|r:0_r:3_ö|r:0\n|_a:0_b:0_r:4\ná:0_a:4\n|_a:0\n');
const scored = (word: string, score: number) => ({ word, score });

describe('upstream rack tabulation', () => {
  it('returns words in length/alphabet order, never score order, with stable highword ties', () => {
    expect(processInput('ARA', dawg)).toEqual({
      ok: true, error: null, rack: 'ara', valid: true,
      words: [scored('ara', 3), scored('raa', 3), scored('aa', 2), scored('ar', 2), scored('ra', 2)],
      highscore: 3, highwords: ['ara', 'raa'], combinations: [],
    });
    const result = processInput('aár', dawg);
    expect(result.words).toEqual([
      scored('ar', 2), scored('ár', 4), scored('ra', 2), scored('rá', 4),
    ]);
    expect(result.highwords).toEqual(['ár', 'rá']);
    expect(result.highscore).toBe(4);
    expect(result.valid).toBe(false);
  });

  it('groups only full rack plus one letter combinations, sorted by added tile', () => {
    expect(processInput('a', dawg)).toEqual({
      ok: true, error: null, rack: 'a', valid: true, words: [], highscore: 0, highwords: [],
      combinations: [
        { letter: 'a', words: [scored('aa', 2)] },
        { letter: 'b', words: [scored('ab', 6), scored('ba', 6)] },
        { letter: 'r', words: [scored('ar', 2), scored('ra', 2)] },
      ],
    });
    expect(processInput('ar', dawg).combinations).toEqual([
      { letter: 'a', words: [scored('ara', 3), scored('raa', 3)] },
      { letter: 'b', words: [scored('bar', 7)] },
    ]);
  });

  it('scores blanks by letter multiplicity, using real letters preferentially', () => {
    const result = processInput('a?', dawg);
    expect(result.words).toEqual(['aa', 'ab', 'ar', 'ba', 'ra'].map((word) => scored(word, 1)));
    expect(result.highscore).toBe(1);
    expect(result.highwords).toEqual(['aa', 'ab', 'ar', 'ba', 'ra']);
    expect(result.combinations).toEqual([]);
    const repeated = processInput('ar?', dawg);
    expect(repeated.words.slice(0, 3)).toEqual([scored('ara', 2), scored('bar', 2), scored('raa', 2)]);
    const blanks = processInput('??', dawg);
    expect(blanks.words.every(({ score }) => score === 0)).toBe(true);
    expect(blanks.highscore).toBe(0);
    expect(blanks.highwords).toEqual(blanks.words.map(({ word }) => word));
  });

  it('normalizes wildcard aliases and uppercase before searching', () => {
    expect(processInput('A_', dawg)).toEqual(processInput('a?', dawg));
    expect(processInput('A*', dawg)).toEqual(processInput('a?', dawg));
    expect(processInput('  ÁR  ', dawg).rack).toBe('ár');
    expect(processInput('  ÁR  ', dawg).valid).toBe(true);
    expect(processInput('  ÁR  ', dawg).words).toEqual([scored('ár', 4), scored('rá', 4)]);
  });

  it('pattern matches sort alphabetically and score wildcard substitutions as normal tiles', () => {
    const result = processInput('=?R', dawg);
    expect(result).toEqual({
      ok: true, error: null, rack: '= ?r', valid: false,
      words: [scored('ar', 2), scored('ár', 4), scored('ör', 7)],
      highscore: 7, highwords: ['ör'], combinations: [],
    });
    expect(processInput('=**', dawg)).toEqual(processInput('=??', dawg));
    expect(processInput('=???', dawg).ok).toBe(true);
    expect(processInput('=???????', dawg).ok).toBe(true);
    expect(processInput('=ar', dawg).valid).toBe(false);
  });

  it('retains empty and one-character pattern success and the exact "= " display prefix', () => {
    for (const input of ['=', '= ', ' = \n']) {
      expect(processInput(input, dawg)).toEqual({
        ok: true, error: null, rack: '= ', valid: false,
        words: [], highscore: 0, highwords: [], combinations: [],
      });
    }
    expect(processInput('=a', dawg).words).toEqual([]);
    expect(processInput('=a', dawg).rack).toBe('= a');
    expect(processInput('?', dawg).ok).toBe(true);
    expect(processInput('?', dawg).words).toEqual([]);
  });

  it('rejects invalid input, foreign letters, internal whitespace and excessive rack wildcards', () => {
    for (const input of ['', ' \n\t', 'c', 'Q', 'w', 'z', 'a b', '= ar', 'a=b', '???', '*_?', '😀', '\ufeffa']) {
      const result = processInput(input, dawg);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.words).toEqual([]);
      expect(result.combinations).toEqual([]);
      expect(result.highwords).toEqual([]);
      expect(result.valid).toBe(false);
    }
    expect(processInput('\u0085\u001ca\u001f', dawg).rack).toBe('a');
  });

  it('preserves Python rack() state on every error instead of echoing rejected input', () => {
    for (const input of ['', ' ', 'abc!', 'a b', 'a=b', '???', 'a'.repeat(14) + '!']) {
      const result = processInput(input, dawg);
      expect(result.ok, input).toBe(false);
      expect(result.rack, input).toBe('');
      expect(result.valid, input).toBe(false);
    }
    for (const input of ['= abc', '=c', '=ab!', ' =\t?']) {
      const result = processInput(input, dawg);
      expect(result.ok, input).toBe(false);
      expect(result.rack, input).toBe('= ');
      expect(result.valid, input).toBe(false);
    }
  });

  it('composes NFC at the public boundary and truncates before stripping whitespace', () => {
    expect(processInput('A\u0301R', dawg)).toEqual(processInput('ÁR', dawg));
    expect(processInput('o\u0308r', dawg)).toEqual(processInput('ör', dawg));
    expect(processInput('               ar', dawg).ok).toBe(false);
    expect(processInput('              ar', dawg).rack).toBe('a');
    expect(processInput('a'.repeat(15) + '!', dawg).ok).toBe(true);
    expect(processInput('a'.repeat(14) + '!', dawg).ok).toBe(false);
    expect(processInput('=a'.padEnd(15, 'a') + '?', dawg).rack).toBe(`= ${'a'.repeat(14)}`);
    expect(processInput('a'.repeat(14) + 'a\u0301!', dawg).rack).toBe('a'.repeat(14) + 'á');
  });

  it('does not leak results between requests or mark a permutation as the original valid rack', () => {
    expect(processInput('ra', dawg).valid).toBe(true);
    expect(processInput('aar', dawg).valid).toBe(false);
    processInput('a?', dawg);
    const result = processInput('xx', dawg);
    expect(result.ok).toBe(true);
    expect(result.words).toEqual([]);
    expect(result.highscore).toBe(0);
    expect(result.highwords).toEqual([]);
    expect(result.combinations).toEqual([]);
  });

  it('retains Tabulator zero-score behavior if a dictionary contains foreign letters', () => {
    const foreign = new Dawg('ac:0');
    expect(processInput('a?', foreign).words).toEqual([scored('ac', 0)]);
    expect(processInput('=a?', foreign).words).toEqual([scored('ac', 0)]);
    expect(processInput('a', foreign).combinations).toEqual([
      { letter: '', words: [scored('ac', 0)] },
    ]);
  });
});

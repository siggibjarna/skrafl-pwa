import { describe, expect, it } from 'vitest';
import {
  Alphabet, allTiles, bagTiles, bitOf, bitPattern, compareWords, fullBag,
  fullOrder, fullUpper, lowercase, order, score, scores, sortkey,
  sortkeyNoCase, stringSubtract, tolower,
} from '../../src/engine/alphabet';

describe('Icelandic alphabet parity', () => {
  it('uses the second upstream sortkey, including its Latin-1 rotation quirks', () => {
    expect(sortkey(fullUpper)).toEqual([...Array.from({ length: 35 }, (_, i) => i + 65), 226]);
    expect(sortkey(fullOrder)).toEqual([...Array.from({ length: 35 }, (_, i) => i + 106), 249]);
    expect(sortkey('?|_:=')).toEqual([63, 142, 104, 58, 61]);
    expect(sortkey('ÖöÆæÞþzZ')).toEqual([226, 249, 99, 140, 98, 139, 138, 97]);
    expect(sortkeyNoCase('ÖöÆæÞþzZ')).toEqual([226, 226, 99, 99, 98, 98, 97, 97]);
    expect(sortkeyNoCase(fullOrder)).toEqual(sortkey(fullUpper));
    expect(() => sortkey('😀')).toThrow(RangeError);
  });

  it('sorts lexicographically and leaves stable equal-key items in order', () => {
    const words = ['ö', 'ár', 'á', 'að', 'a', 'æ', 'þ', 'z', 'A', 'Ö'];
    expect(Alphabet.sorted(words)).toEqual(['A', 'a', 'að', 'á', 'ár', 'z', 'þ', 'æ', 'Ö', 'ö']);
    expect(words[0]).toBe('ö');
    Alphabet.sort(words);
    expect(words).toEqual(Alphabet.sorted(words));
    expect(compareWords('a', 'aa')).toBeLessThan(0);
    expect(['á', 'Á', 'a', 'A'].sort((a, b) => {
      const left = sortkeyNoCase(a)[0]!;
      return left - sortkeyNoCase(b)[0]!;
    })).toEqual(['a', 'A', 'á', 'Á']);
  });

  it('maps only the explicit Icelandic alphabet rather than generic Unicode lowercasing', () => {
    expect(tolower(fullUpper)).toBe(fullOrder);
    expect(tolower('ẞİ_A?')).toBe('ẞİ_a?');
    expect(lowercase('Ö')).toBe('ö');
    expect(() => lowercase('a')).toThrow();
    expect(() => lowercase('')).toThrow();
  });

  it('scores all tiles and preserves the original 100-tile bag', () => {
    expect(allTiles).toBe(`${order}?`);
    expect(Object.keys(scores).join('')).toBe(allTiles);
    expect(score('áéíóúýþæöx?')).toBe(53);
    expect(score(null)).toBe(0);
    expect(score('')).toBe(0);
    expect(() => score('c')).toThrow();
    expect(() => score('A')).toThrow();
    expect(fullBag().length).toBe(100);
    expect(score(fullBag())).toBe(227);
    for (const [letter, count] of bagTiles) {
      expect([...fullBag()].filter((tile) => tile === letter)).toHaveLength(count);
    }
  });

  it('subtracts multisets in tile order, ignoring unknown letters and negative counts', () => {
    expect(stringSubtract('rraá?aaö', 'ra?áá')).toBe('aarö');
    expect(stringSubtract('xxccc??', 'xxx?')).toBe('?');
    expect(stringSubtract('a', 'aaa')).toBe('');
  });

  it('keeps the high tile bit unsigned, unlike ordinary JS bit operations', () => {
    expect(bitOf('a')).toBe(1);
    expect(bitOf('ö')).toBe(2 ** 31);
    expect(bitPattern('ööa')).toBe(2 ** 31 + 1);
    expect(bitPattern(order)).toBe(4294967295);
    expect(Alphabet.all_bits_set()).toBe(4294967295);
    expect(bitPattern('')).toBe(0);
    expect(() => bitOf('?')).toThrow();
  });
});

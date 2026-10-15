import { describe, expect, it } from 'vitest';
import { matchesFilter, wordLengthBounds, type WordFilter } from '../../src/ui/filter';

const defaults: WordFilter = { min: 1, max: 15, positions: [], contains: '' };

describe('result filters', () => {
  it('applies inclusive length bounds', () => {
    const filter = { ...defaults, min: 3, max: 4 };
    expect(matchesFilter('ís', filter)).toBe(false);
    expect(matchesFilter('hús', filter)).toBe(true);
    expect(matchesFilter('húsi', filter)).toBe(true);
    expect(matchesFilter('húsið', filter)).toBe(false);
  });

  it('matches Icelandic letters at one-based positions, ignoring case', () => {
    const filter = { ...defaults, positions: [' Þ ', '', 'Ð'] };
    expect(matchesFilter('það', filter)).toBe(true);
    expect(matchesFilter('þau', filter)).toBe(false);
    expect(matchesFilter('þá', filter)).toBe(false);
  });

  it('requires each occurrence of contains letters, in any order', () => {
    const filter = { ...defaults, contains: ' AAA ' };
    expect(matchesFilter('banani', filter)).toBe(false);
    expect(matchesFilter('bananar', filter)).toBe(true);
    expect(matchesFilter('aaab', filter)).toBe(true);
  });

  it('combines positional, length and multiset filters', () => {
    const filter = { min: 4, max: 5, positions: ['', 'Ú'], contains: 'hð' };
    expect(matchesFilter('húsið', filter)).toBe(true);
    expect(matchesFilter('húsi', filter)).toBe(false);
    expect(matchesFilter('húsinu', filter)).toBe(false);
    expect(matchesFilter('heið', filter)).toBe(false);
  });

  it('ignores retained positions outside the currently displayed boxes', () => {
    const filter = { ...defaults, max: 2, positions: ['', '', 'a'] };
    expect(matchesFilter('ís', filter)).toBe(true);
    expect(matchesFilter('ís', { ...filter, max: 3 })).toBe(false);
  });

  it('can apply the same predicate to main and combination lists', () => {
    const filter = { ...defaults, contains: 'aa' };
    const main = [{ word: 'ana' }, { word: 'ann' }];
    const combinations = [{ word: 'anna' }, { word: 'anni' }];
    expect(main.filter(({ word }) => matchesFilter(word, filter))).toEqual([{ word: 'ana' }]);
    expect(combinations.filter(({ word }) => matchesFilter(word, filter))).toEqual([{ word: 'anna' }]);
  });

  it('computes bounds across lists and handles empty results', () => {
    expect(wordLengthBounds([])).toEqual({ min: 1, max: 15 });
    expect(wordLengthBounds([{ word: 'ís' }, { word: 'hús' }, { word: 'húsið' }]))
      .toEqual({ min: 2, max: 5 });
  });

  it('treats an inverted range as no matches and empty constraints as unrestricted', () => {
    expect(matchesFilter('hús', { ...defaults, min: 5, max: 2 })).toBe(false);
    expect(matchesFilter('hús', { ...defaults, positions: [' ', ''], contains: ' ' })).toBe(true);
  });
});

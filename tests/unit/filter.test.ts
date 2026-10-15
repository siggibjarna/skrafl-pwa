import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../../src/engine/tabulator';
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

  describe('result presentation', () => {
    interface AppHarness {
      result: SearchResult;
      input: string;
      client: { search(input: string): Promise<SearchResult> };
      search(input: string, push: boolean): Promise<void>;
      bounds: { min: number; max: number };
      positions: string[];
      filterMax: string;
      appliedFilter: WordFilter;
      applyFilters(): void;
      readonly displayRack: string;
      readonly displayValid: boolean;
      renderWord(word: { word: string; score: number }): { values: unknown[] };
    }
    let createApp: () => AppHarness;

    beforeAll(async () => {
      vi.stubGlobal('customElements', { get() {}, define() {} });
      try {
        const { SkraflApp } = await import('../../src/ui/app');
        createApp = () => new SkraflApp() as unknown as AppHarness;
      } finally {
        vi.unstubAllGlobals();
      }
    });

    function result(overrides: Partial<SearchResult> = {}): SearchResult {
      return {
        ok: true, error: null, rack: '= afi', words: [{ word: 'afi', score: 6 }],
        highscore: 6, highwords: ['afi'], combinations: [], valid: false, ...overrides,
      };
    }

    it('corrects the displayed pattern without changing the parity result', () => {
      const app = createApp();
      app.result = result();
      expect(app.displayRack).toBe('=afi');
      expect(app.displayValid).toBe(true);
      expect(app.result.rack).toBe('= afi');
      expect(app.result.valid).toBe(false);
    });

    it('does not mark wildcard or missing literal patterns as valid words', () => {
      const app = createApp();
      app.result = result({ rack: '= af?' });
      expect(app.displayValid).toBe(false);
      app.result = result({ rack: '= xyz', words: [] });
      expect(app.displayValid).toBe(false);
      app.result = result({ rack: 'afi', valid: true });
      expect(app.displayValid).toBe(true);
    });

    it('renders a score for a word from either list', () => {
      const app = createApp();
      app.result = result({ rack: 'af' });
      expect(app.renderWord({ word: 'afi', score: 6 }).values.at(-1)).toBe(6);
    });

    it('passes raw input through for engine truncate-before-strip handling', async () => {
      const app = createApp();
      const search = vi.fn(async () => result({ ok: false, words: [], error: 'Sláðu inn stafi.' }));
      app.client = { search };
      const raw = ' '.repeat(15) + 'ár';
      await app.search(raw, false);
      expect(search).toHaveBeenCalledWith(raw);
      expect(app.input).toBe(raw);
    });

    it('excludes hidden boxes from applied filters and restores them on expansion', () => {
      const app = createApp();
      app.bounds = { min: 2, max: 5 };
      app.positions = ['h', '', '', '', 'ð'];
      app.filterMax = '2';
      app.applyFilters();
      expect(app.appliedFilter.positions).toEqual(['h', '']);
      expect(app.positions[4]).toBe('ð');
      app.filterMax = '5';
      app.applyFilters();
      expect(app.appliedFilter.positions[4]).toBe('ð');
    });
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

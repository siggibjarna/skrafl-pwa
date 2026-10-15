import { describe, expect, it } from 'vitest';
import { Dawg } from '../../src/engine/dawg';
import { compareWords } from '../../src/engine/alphabet';

// Builder documentation example: forward references, shared suffixes and inline finals.
const text = 'do:3_ca:2_ea:2\nt|s:0_r|s:0\n|_g|s:0_ne:0\n';
const dictionaryWords = ['car', 'cars', 'cat', 'cats', 'do', 'dog', 'dogs', 'done', 'ear', 'ears', 'eat', 'eats'];

describe('text DAWG navigation', () => {
  it('recognizes every inline, explicit-node and terminal final', () => {
    const dawg = new Dawg(text);
    for (const word of dictionaryWords) expect(dawg.find(word), word).toBe(true);
    for (const word of ['', 'd', 'don', 'ca', 'e', 'eart', 'dogsx', 'carsx', 'Do']) {
      expect(dawg.find(word), word).toBe(false);
    }
  });

  it('skips blank lines without changing node ids and accepts CRLF', () => {
    const dawg = new Dawg(`\r\n${text.replaceAll('\n', '\r\n\r\n')}`);
    for (const word of dictionaryWords) expect(dawg.find(word), word).toBe(true);
  });

  it('restores the rack after sibling, shared-node and partially rejected edges', () => {
    const dawg = new Dawg(text);
    expect(dawg.permutations('cats')).toEqual(['cats', 'cat']);
    expect(dawg.permutations('earts')).toEqual(['ears', 'eats', 'ear', 'eat']);
    expect(dawg.permutations('do?')).toEqual(['dog', 'do']);
    expect(dawg.permutations('car?')).toEqual(['cars', 'car', 'cat', 'ear']);
    expect(dawg.permutations('car?', 4)).toEqual(['cars']);
    expect(dawg.permutations('?', 2)).toEqual([]);
    expect(dawg.permutations('')).toEqual([]);
    expect(dawg.permutations('ccaa')).toEqual([]);
    expect(dawg.permutations('cars')).toEqual(['cars', 'car']);
  });

  it('restores pattern state on nested wildcard and rejected compressed prefixes', () => {
    const dawg = new Dawg(text);
    expect(dawg.match('???')).toEqual(['car', 'cat', 'dog', 'ear', 'eat']);
    expect(dawg.match('????')).toEqual(['cars', 'cats', 'dogs', 'done', 'ears', 'eats']);
    expect(dawg.match('?a?')).toEqual(['car', 'cat', 'ear', 'eat']);
    expect(dawg.match('d???')).toEqual(['dogs', 'done']);
    expect(dawg.match('??s')).toEqual([]);
    expect(dawg.match('d?')).toEqual(['do']);
    expect(dawg.match('cat')).toEqual(['cat']);
    expect(dawg.match('')).toEqual([]);
  });

  it('handles multiple inline finals and consumes real letters before blanks', () => {
    const dawg = new Dawg('a|a|a:0_b|a|r:0_ö|r:0');
    expect(dawg.permutations('aa?')).toEqual(['aaa', 'aa', 'ba', 'a', 'b', 'ö']);
    expect(dawg.match('?')).toEqual(['a', 'b', 'ö']);
    expect(dawg.find('aaa')).toBe(true);
    expect(dawg.find('aa')).toBe(true);
    expect(dawg.find('a')).toBe(true);
    expect(dawg.find('aaaa')).toBe(false);
  });

  it('keeps calls independent', () => {
    const dawg = new Dawg(text);
    const first = dawg.permutations('??');
    first.push('not-in-dictionary');
    expect(dawg.permutations('??')).toEqual(['do']);
    expect(dawg.match('??')).toEqual(['do']);
  });

  it('rejects malformed edge records rather than silently changing the graph', () => {
    for (const malformed of [
      '', '\n\r\n', '|', 'a', 'a:x', ':0', 'a:-1', 'a:0:1',
      'a:1', 'a:2', 'a:999999999999999999999999',
      '|a:0', 'a||b:0', 'a?:0', 'a b:0', 'a😀:0', 'a:0_a:0', 'a:0_ab:0',
      'a:0\nb:0', 'a:2\nb:2', 'a:2\nb:3\nc:2',
    ]) {
      expect(() => new Dawg(malformed), JSON.stringify(malformed)).toThrow();
    }
  });

  it('permits final markers after letters and supports uppercase and foreign alphabet letters', () => {
    const dawg = new Dawg('A|B:0_c|q|w|z|:0');
    for (const word of ['A', 'AB', 'c', 'cq', 'cqw', 'cqwz']) {
      expect(dawg.find(word), word).toBe(true);
    }
  });

  it('agrees with independent word-list filtering for exhaustive short wildcard queries', () => {
    const dawg = new Dawg(text);
    const alphabet = ['a', 'c', 'd', 'e', 'o', 'r', 's', 't', '?'];
    let queries = [''];
    for (let length = 1; length <= 4; length += 1) {
      queries = queries.flatMap((prefix) => alphabet.map((letter) => prefix + letter));
      for (const query of queries) {
        const expectedPermutations = dictionaryWords.filter((word) => {
          let rack = query;
          for (const letter of word) {
            const tile = rack.includes(letter) ? letter : '?';
            if (!rack.includes(tile)) return false;
            rack = rack.replace(tile, '');
          }
          return true;
        }).sort((a, b) => b.length - a.length || compareWords(a, b));
        const expectedMatches = dictionaryWords.filter((word) => (
          word.length === query.length &&
          [...word].every((letter, index) => query[index] === '?' || query[index] === letter)
        )).sort(compareWords);
        expect(dawg.permutations(query), `rack ${query}`).toEqual(expectedPermutations);
        expect(dawg.match(query), `pattern ${query}`).toEqual(expectedMatches);
      }
    }
  });
});

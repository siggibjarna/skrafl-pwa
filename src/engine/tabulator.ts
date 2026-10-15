import { lowercase, order, score, scores, stringSubtract, upper } from './alphabet';
import { Dawg } from './dawg';

export interface ScoredWord { word: string; score: number }
export interface Combination { letter: string; words: ScoredWord[] }
export interface SearchResult {
  ok: boolean;
  error: string | null;
  rack: string;
  words: ScoredWord[];
  highscore: number;
  highwords: string[];
  combinations: Combination[];
  valid: boolean;
}

// Python str.strip() includes these controls but not JavaScript's BOM whitespace.
const boundaryWhitespace = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;

function wordScore(word: string): number {
  // Tabulator, unlike Alphabet.score(), zeroes the entire word on an unknown tile.
  try {
    return score(word);
  } catch {
    return 0;
  }
}

/** The web boundary composes Unicode, then truncates before Tabulator strips. */
export function processInput(input: string, dawg: Dawg): SearchResult {
  const truncated = Array.from(input.normalize('NFC')).slice(0, 15).join('');
  let rack = truncated.replace(boundaryWhitespace, '');
  const result: SearchResult = {
    ok: false, error: null, rack: truncated, words: [], highscore: 0,
    highwords: [], combinations: [], valid: false,
  };
  function fail(message: string): SearchResult {
    result.error = message;
    return result;
  }
  if (!rack) return fail('Sláðu inn stafi.');
  const pattern = rack.startsWith('=');
  if (pattern) rack = rack.slice(1);
  let normalized = '';
  let wildcards = 0;
  for (const character of rack) {
    let letter = upper.includes(character) ? lowercase(character) : character;
    if ('?_*'.includes(letter)) {
      letter = '?';
      wildcards += 1;
    } else if (!Object.hasOwn(scores, letter)) {
      return fail('Ógildur stafur.');
    }
    normalized += letter;
  }
  if (!pattern && wildcards > 2) return fail('Að hámarki má nota tvö jokertákn.');
  result.ok = true;
  result.rack = pattern ? `= ${normalized}` : normalized;
  result.valid = !pattern && dawg.find(normalized);
  if (!pattern && !wildcards) {
    const query = `${normalized}?`;
    const combinations = new Map<string, ScoredWord[]>();
    for (const word of dawg.permutations(query)) {
      if (word.length !== query.length) continue;
      const letter = stringSubtract(word, normalized);
      const words = combinations.get(letter) ?? [];
      words.push({ word, score: wordScore(word) });
      combinations.set(letter, words);
    }
    result.combinations = [...combinations]
      .sort(([left], [right]) => order.indexOf(left) - order.indexOf(right))
      .map(([letter, words]) => ({ letter, words }));
  }
  if (normalized.length < 2) return result;
  const words = pattern ? dawg.match(normalized) : dawg.permutations(normalized);
  for (const word of words) {
    if (word.length < 2) continue;
    let value = wordScore(word);
    if (wildcards && !pattern) value -= wordScore(stringSubtract(word, normalized));
    result.words.push({ word, score: value });
    if (value > result.highscore) {
      result.highscore = value;
      result.highwords = [word];
    } else if (value === result.highscore) {
      result.highwords.push(word);
    }
  }
  return result;
}

export interface WordFilter {
  min: number;
  max: number;
  positions: readonly string[];
  endPositions: readonly string[];
  contains: string;
}

// A position box holds any number of letters; a word matches if its letter there is one of them.
function positionLetters(value: string | undefined): string {
  return (value ?? '').replace(/[\s,;]/g, '').toLocaleLowerCase('is');
}

function allows(letters: string, letter: string | undefined): boolean {
  return letter !== undefined && letters.includes(letter);
}

export function matchesFilter(word: string, filter: WordFilter): boolean {
  const normalized = word.toLocaleLowerCase('is');
  if (normalized.length < filter.min || normalized.length > filter.max) return false;
  for (let index = 0; index < filter.max; index++) {
    const letters = positionLetters(filter.positions[index]);
    if (letters && !allows(letters, normalized[index])) return false;
  }
  for (let index = 0; index < filter.max; index++) {
    const letters = positionLetters(filter.endPositions[index]);
    if (letters && !allows(letters, normalized[normalized.length - 1 - index])) return false;
  }
  let remaining = normalized;
  for (const letter of filter.contains.trim().toLocaleLowerCase('is')) {
    const index = remaining.indexOf(letter);
    if (index === -1) return false;
    remaining = remaining.slice(0, index) + remaining.slice(index + 1);
  }
  return true;
}

export function wordLengthBounds(words: readonly { word: string }[]): { min: number; max: number } {
  if (!words.length) return { min: 1, max: 15 };
  let min = Infinity;
  let max = 0;
  for (const { word } of words) {
    min = Math.min(min, word.length);
    max = Math.max(max, word.length);
  }
  return { min, max };
}

export function sortByScore<T extends { score: number }>(words: readonly T[]): T[] {
  return words
    .map((word, index) => ({ word, index }))
    .sort((left, right) => right.word.score - left.word.score || left.index - right.index)
    .map(({ word }) => word);
}

export interface WordFilter {
  min: number;
  max: number;
  positions: readonly string[];
  contains: string;
}

export function matchesFilter(word: string, filter: WordFilter): boolean {
  const normalized = word.toLocaleLowerCase('is');
  if (normalized.length < filter.min || normalized.length > filter.max) return false;
  for (let index = 0; index < filter.max; index++) {
    const letter = (filter.positions[index] ?? '').trim().toLocaleLowerCase('is');
    if (letter && normalized[index] !== letter) return false;
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

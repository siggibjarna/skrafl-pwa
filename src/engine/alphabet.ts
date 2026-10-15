/** Icelandic tile values and the upstream Latin-1 collation. */
export const order = 'aábdðeéfghiíjklmnoóprstuúvxyýþæö';
export const upper = 'AÁBDÐEÉFGHIÍJKLMNOÓPRSTUÚVXYÝÞÆÖ';
export const fullOrder = 'aábcdðeéfghiíjklmnoópqrstuúvwxyýzþæö';
export const fullUpper = 'AÁBCDÐEÉFGHIÍJKLMNOÓPQRSTUÚVWXYÝZÞÆÖ';
export const allTiles = `${order}?`;
export const scores: Readonly<Record<string, number>> = Object.freeze({
  a: 1, á: 3, b: 5, d: 5, ð: 2, e: 3, é: 7, f: 3,
  g: 3, h: 4, i: 1, í: 4, j: 6, k: 2, l: 2, m: 2,
  n: 1, o: 5, ó: 3, p: 5, r: 1, s: 1, t: 2, u: 2,
  ú: 4, v: 5, x: 10, y: 6, ý: 5, þ: 7, æ: 4, ö: 6, '?': 0,
});
export const bagTiles: ReadonlyArray<readonly [string, number]> = [
  ['a', 11], ['á', 2], ['b', 1], ['d', 1], ['ð', 4], ['e', 3],
  ['é', 1], ['f', 3], ['g', 3], ['h', 1], ['i', 7], ['í', 1],
  ['j', 1], ['k', 4], ['l', 5], ['m', 3], ['n', 7], ['o', 1],
  ['ó', 2], ['p', 1], ['r', 8], ['s', 7], ['t', 6], ['u', 6],
  ['ú', 1], ['v', 1], ['x', 1], ['y', 1], ['ý', 1], ['þ', 1],
  ['æ', 2], ['ö', 1], ['?', 2],
];

const collation = Array.from({ length: 256 }, (_, index) => index);
function adjust(letters: string): void {
  // The Python range deliberately excludes the last letter.
  for (let index = 1; index < letters.length - 1; index += 1) {
    const letter = letters.charCodeAt(index);
    const sortAs = collation[letters.charCodeAt(index - 1)]! + 1;
    const previous = collation[letter]!;
    if (previous > sortAs) {
      for (let code = 0; code < 256; code += 1) {
        if (collation[code]! >= sortAs && collation[code]! < previous) {
          collation[code]! += 1;
        }
      }
    }
    collation[letter] = sortAs;
  }
}
adjust(fullUpper);
adjust(fullOrder);
const collationNoCase = [...collation];
for (let index = 0; index < fullOrder.length; index += 1) {
  collationNoCase[fullOrder.charCodeAt(index)] = collation[fullUpper.charCodeAt(index)]!;
}

function keyFor(word: string, mapping: number[]): number[] {
  return Array.from(word, (letter) => {
    const code = letter.codePointAt(0)!;
    if (code > 255) throw new RangeError('Collation requires Latin-1 characters');
    return mapping[code]!;
  });
}

export function sortkey(word: string): number[] {
  return keyFor(word, collation);
}
export function sortkeyNoCase(word: string): number[] {
  return keyFor(word, collationNoCase);
}
export function compareKeys(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
export function compareWords(left: string, right: string): number {
  return compareKeys(sortkey(left), sortkey(right));
}
export function score(tiles: string | null | undefined): number {
  let total = 0;
  for (const tile of tiles ?? '') {
    if (!Object.hasOwn(scores, tile)) throw new RangeError(`Invalid tile: ${tile}`);
    total += scores[tile]!;
  }
  return total;
}
export function lowercase(letter: string): string {
  const index = fullUpper.indexOf(letter);
  if (letter.length !== 1 || index < 0) throw new RangeError(`Invalid uppercase letter: ${letter}`);
  return fullOrder[index]!;
}
export function tolower(word: string): string {
  return Array.from(word, (letter) => fullUpper.includes(letter) ? lowercase(letter) : letter).join('');
}
export function stringSubtract(left: string, right: string): string {
  const counts = new Map<string, number>();
  for (const letter of left) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  for (const letter of right) counts.set(letter, (counts.get(letter) ?? 0) - 1);
  return Array.from(allTiles, (letter) => letter.repeat(Math.max(0, counts.get(letter) ?? 0))).join('');
}
export function bitOf(letter: string): number {
  const index = order.indexOf(letter);
  if (letter.length !== 1 || index < 0) throw new RangeError(`Invalid tile: ${letter}`);
  return 2 ** index;
}
export function bitPattern(word: string): number {
  return Array.from(word).reduce((bits, letter) => (bits | bitOf(letter)) >>> 0, 0);
}
export function fullBag(): string {
  return bagTiles.map(([letter, count]) => letter.repeat(count)).join('');
}

export class Alphabet {
  static readonly order = order;
  static readonly upper = upper;
  static readonly full_order = fullOrder;
  static readonly full_upper = fullUpper;
  static readonly all_tiles = allTiles;
  static readonly scores = scores;
  static readonly bag_tiles = bagTiles;
  static readonly score = score;
  static readonly lowercase = lowercase;
  static readonly tolower = tolower;
  static readonly sortkey = sortkey;
  static readonly sortkey_nocase = sortkeyNoCase;
  static readonly string_subtract = stringSubtract;
  static readonly bit_of = bitOf;
  static readonly bit_pattern = bitPattern;
  static readonly full_bag = fullBag;
  static all_bits_set(): number { return 2 ** order.length - 1; }
  static sort(words: string[]): void { words.sort(compareWords); }
  static sorted(words: readonly string[]): string[] { return [...words].sort(compareWords); }
}

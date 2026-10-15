import { compareWords } from './alphabet';

class Node {
  final = false;
  edges = new Map<string, Node | null>();
}

interface Navigator {
  pushEdge(first: string): boolean;
  accepting(): boolean;
  accepts(letter: string): boolean;
  accept(matched: string, final: boolean): void;
  popEdge(): boolean;
  done(): void;
}

/** Traversal retains edge-local navigator state, including on rejected prefixes. */
function navigate(root: Node | undefined, nav: Navigator): void {
  function fromNode(node: Node, matched: string): void {
    for (const [prefix, next] of node.edges) {
      if (nav.pushEdge(prefix[0]!)) {
        fromEdge(prefix, next, matched);
        if (!nav.popEdge()) break;
      }
    }
  }
  function fromEdge(prefix: string, next: Node | null, matched: string): void {
    let index = 0;
    while (index < prefix.length && nav.accepting()) {
      if (!nav.accepts(prefix[index]!)) return;
      matched += prefix[index]!;
      index += 1;
      let final = false;
      if (index < prefix.length && prefix[index] === '|') {
        final = true;
        index += 1;
      } else if (index >= prefix.length && (next === null || next.final)) {
        final = true;
      }
      nav.accept(matched, final);
    }
    if (index === prefix.length && nav.accepting() && next !== null) {
      fromNode(next, matched);
    }
  }
  if (root && nav.accepting()) fromNode(root, '');
  nav.done();
}

class FindNavigator implements Navigator {
  private index = 0;
  found = false;
  constructor(private readonly word: string) {}
  pushEdge(first: string): boolean { return this.word[this.index] === first; }
  accepting(): boolean { return this.index < this.word.length; }
  accepts(letter: string): boolean {
    if (letter !== this.word[this.index]) return false;
    this.index += 1;
    return true;
  }
  accept(_matched: string, final: boolean): void {
    if (final && this.index === this.word.length) this.found = true;
  }
  popEdge(): boolean { return false; }
  done(): void {}
}

class PermutationNavigator implements Navigator {
  private stack: string[] = [];
  readonly result: string[] = [];
  constructor(private rack: string, private readonly minLength: number) {}
  pushEdge(first: string): boolean {
    if (!this.rack.includes(first) && !this.rack.includes('?')) return false;
    this.stack.push(this.rack);
    return true;
  }
  accepting(): boolean { return this.rack.length > 0; }
  accepts(letter: string): boolean {
    const tile = this.rack.includes(letter) ? letter : '?';
    if (!this.rack.includes(tile)) return false;
    this.rack = this.rack.replace(tile, '');
    return true;
  }
  accept(matched: string, final: boolean): void {
    if (final && matched.length >= this.minLength) this.result.push(matched);
  }
  popEdge(): boolean {
    this.rack = this.stack.pop()!;
    return true;
  }
  done(): void {
    this.result.sort((left, right) => right.length - left.length || compareWords(left, right));
  }
}

class MatchNavigator implements Navigator {
  private index = 0;
  private stack: number[] = [];
  readonly result: string[] = [];
  constructor(private readonly pattern: string) {}
  pushEdge(first: string): boolean {
    if (this.pattern[this.index] !== '?' && this.pattern[this.index] !== first) return false;
    this.stack.push(this.index);
    return true;
  }
  accepting(): boolean { return this.index < this.pattern.length; }
  accepts(letter: string): boolean {
    if (this.pattern[this.index] !== '?' && this.pattern[this.index] !== letter) return false;
    this.index += 1;
    return true;
  }
  accept(matched: string, final: boolean): void {
    if (final && this.index === this.pattern.length) this.result.push(matched);
  }
  popEdge(): boolean {
    this.index = this.stack.pop()!;
    return this.pattern[this.index] === '?';
  }
  done(): void { this.result.sort(compareWords); }
}

/** Text DAWG: root id 0, subsequent nonempty lines numbered 2, 3, ... */
export class Dawg {
  private readonly nodes = new Map<number, Node>();

  constructor(text: string) {
    let index = 1;
    const nodeAt = (id: number): Node => {
      let node = this.nodes.get(id);
      if (!node) {
        node = new Node();
        this.nodes.set(id, node);
      }
      return node;
    };
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const node = nodeAt(index > 1 ? index : 0);
      index += 1;
      const edges = line.split('_');
      node.final = edges[0] === '|';
      for (const edge of edges.slice(node.final ? 1 : 0)) {
        const parts = edge.split(':');
        const prefix = parts[0]!;
        const destination = parts[1];
        if (!prefix || parts.length !== 2 || !/^\d+$/.test(destination ?? '')) {
          throw new Error(`Invalid DAWG edge: ${edge}`);
        }
        const id = Number(destination);
        node.edges.set(prefix, id === 0 ? null : nodeAt(id));
      }
    }
  }

  find(word: string): boolean {
    const nav = new FindNavigator(word);
    navigate(this.nodes.get(0), nav);
    return nav.found;
  }

  permutations(rack: string, minLength = 0): string[] {
    const nav = new PermutationNavigator(rack, minLength);
    navigate(this.nodes.get(0), nav);
    return nav.result;
  }

  match(pattern: string): string[] {
    const nav = new MatchNavigator(pattern);
    navigate(this.nodes.get(0), nav);
    return nav.result;
  }
}

import type { SearchResult } from '../engine/tabulator';

export type WorkerRequest = { type: 'search'; id: number; input: string };
export type WorkerResponse =
  | { type: 'status'; status: string }
  | { type: 'result'; id: number; result: SearchResult; parseMs: number; searchMs: number }
  | { type: 'error'; id: number; message: string };

/// <reference lib="webworker" />
import { Dawg } from '../engine/dawg';
import { processInput } from '../engine/tabulator';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as DedicatedWorkerGlobalScope;
const send = (message: WorkerResponse) => scope.postMessage(message);
let dictionary: Promise<Dawg> | undefined;
let parseMs = 0;

async function loadDictionary(): Promise<Dawg> {
  send({ type: 'status', status: 'Sæki orðasafn…' });
  const directory = import.meta.env.MODE === 'mock' ? 'mock' : 'dict';
  const manifestUrl = new URL(`${import.meta.env.BASE_URL}${directory}/dict-manifest.json`, scope.location.origin);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error('Ekki tókst að sækja lýsingu orðasafns.');
  const manifest: unknown = await response.json();
  if (!manifest || typeof manifest !== 'object' || !('file' in manifest) ||
      typeof manifest.file !== 'string' || !/^ordalisti\.[a-f0-9]+\.text\.dawg$/.test(manifest.file)) {
    throw new Error('Lýsing orðasafns er ógild.');
  }
  const words = await fetch(new URL(manifest.file, manifestUrl));
  if (!words.ok) throw new Error('Ekki tókst að sækja orðasafn.');
  const text = await words.text();
  if (!text.trim()) throw new Error('Orðasafnið er tómt. Reyndu aftur.');
  send({ type: 'status', status: 'Les orðasafn…' });
  performance.mark('dictionary-parse-start');
  const dawg = new Dawg(text);
  performance.mark('dictionary-parse-end');
  parseMs = performance.measure('dictionary-parse', 'dictionary-parse-start', 'dictionary-parse-end').duration;
  return dawg;
}

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type !== 'search') return;
  try {
    dictionary ??= loadDictionary();
    const dawg = await dictionary;
    send({ type: 'status', status: 'Leita…' });
    performance.mark('search-start');
    const result = processInput(data.input, dawg);
    performance.mark('search-end');
    const searchMs = performance.measure('search', 'search-start', 'search-end').duration;
    send({ type: 'result', id: data.id, result, parseMs, searchMs });
    performance.clearMarks();
    performance.clearMeasures();
  } catch (error) {
    dictionary = undefined;
    send({ type: 'error', id: data.id, message: error instanceof Error ? error.message : 'Villa við lestur orðasafns.' });
  }
};

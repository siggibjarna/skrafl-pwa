import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/engine/dawg', () => ({
  Dawg: class {
    constructor(text: string) {
      if (text === 'broken') throw new Error('Invalid dictionary');
    }
  },
}));
vi.mock('../../src/engine/tabulator', () => ({
  processInput: () => ({ ok: true, rack: 'afi' }),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

async function start(fetch: ReturnType<typeof vi.fn>) {
  vi.stubEnv('BASE_URL', '/skrafl-pwa/');
  const worker = { location: { origin: 'https://example.org' }, postMessage: vi.fn(), onmessage: undefined as unknown };
  vi.stubGlobal('self', worker);
  vi.stubGlobal('fetch', fetch);
  await import('../../src/worker/engine-worker');
  return {
    messages: worker.postMessage,
    search: worker.onmessage as (event: { data: { type: string; id: number; input: string } }) => Promise<void>,
  };
}

it('resolves dictionary fetches relative to the Pages base and reuses a parsed dictionary', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ file: 'ordalisti.abc.text.dawg' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => 'good' });
  const worker = await start(fetch);
  await worker.search({ data: { type: 'search', id: 1, input: 'afi' } });
  await worker.search({ data: { type: 'search', id: 2, input: 'afi' } });
  expect(String(fetch.mock.calls[0][0])).toBe('https://example.org/skrafl-pwa/dict/dict-manifest.json');
  expect(String(fetch.mock.calls[1][0])).toBe('https://example.org/skrafl-pwa/dict/ordalisti.abc.text.dawg');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(worker.messages).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', id: 2 }));
});

it('rejects external dictionary paths and allows retry after a loading failure', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ file: 'https://other.example/dict' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ file: 'ordalisti.abc.text.dawg' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => 'good' });
  const worker = await start(fetch);
  await worker.search({ data: { type: 'search', id: 1, input: 'afi' } });
  expect(worker.messages).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', id: 1 }));
  await worker.search({ data: { type: 'search', id: 2, input: 'afi' } });
  expect(worker.messages).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', id: 2 }));
});

it('reports parse failure instead of retaining a failed dictionary promise', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ file: 'ordalisti.abc.text.dawg' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => 'broken' });
  const worker = await start(fetch);
  await worker.search({ data: { type: 'search', id: 1, input: 'afi' } });
  expect(worker.messages).toHaveBeenCalledWith({ type: 'error', id: 1, message: 'Invalid dictionary' });
});

it('does not treat an empty dictionary download as a successful search', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ file: 'ordalisti.abc.text.dawg' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => '\n' });
  const worker = await start(fetch);
  await worker.search({ data: { type: 'search', id: 1, input: 'afi' } });
  expect(worker.messages).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', id: 1 }));
});

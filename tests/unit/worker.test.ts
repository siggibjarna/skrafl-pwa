import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../../src/worker/client';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}

afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; });

describe('worker cancellation', () => {
  it('terminates busy worker, rejects old search and ignores its result', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new EngineClient(vi.fn());
    const first = client.search('a??');
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const oldWorker = FakeWorker.instances[0];
    const second = client.search('afi');
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    oldWorker.onmessage?.({ data: { type: 'result', id: 1, result: { rack: 'old' } } });
    const worker = FakeWorker.instances[1];
    worker.onmessage?.({ data: { type: 'result', id: 2, result: { rack: 'afi' }, parseMs: 1, searchMs: 1 } });
    await rejected;
    await expect(second).resolves.toEqual({ rack: 'afi' });
    client.dispose();
  });

  it('can start again after a failed worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new EngineClient(vi.fn());
    const first = client.search('afi');
    FakeWorker.instances[0].onerror?.();
    await expect(first).rejects.toThrow('Reyndu aftur');
    const second = client.search('afi');
    expect(FakeWorker.instances).toHaveLength(2);
    client.dispose();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  });
});

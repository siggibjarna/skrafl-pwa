import type { SearchResult } from '../engine/tabulator';
import type { WorkerRequest, WorkerResponse } from './protocol';

export class EngineClient {
  private worker?: Worker;
  private sequence = 0;
  private pending?: {
    id: number;
    resolve: (result: SearchResult) => void;
    reject: (reason: Error) => void;
  };

  constructor(private readonly onStatus: (status: string) => void) {}

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (this.worker !== worker) return;
      if (data.type === 'status') {
        this.onStatus(data.status);
      } else if (this.pending?.id === data.id) {
        const pending = this.pending;
        this.pending = undefined;
        if (data.type === 'error') pending.reject(new Error(data.message));
        else {
          performance.clearMeasures('engine-parse');
          performance.clearMeasures('engine-search');
          performance.measure('engine-parse', { start: 0, duration: data.parseMs });
          performance.measure('engine-search', { start: 0, duration: data.searchMs });
          pending.resolve(data.result);
        }
      }
    };
    worker.onerror = () => {
      if (this.worker !== worker) return;
      this.pending?.reject(new Error('Ekki tókst að ræsa orðaleit. Reyndu aftur.'));
      this.pending = undefined;
      worker.terminate();
      this.worker = undefined;
    };
    this.worker = worker;
    return worker;
  }

  search(input: string): Promise<SearchResult> {
    if (this.pending) this.dispose();
    const worker = this.start();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      const message: WorkerRequest = { type: 'search', id, input };
      worker.postMessage(message);
    });
  }

  retry(): void {
    this.dispose();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.pending?.reject(new DOMException('Leit hætt.', 'AbortError'));
    this.pending = undefined;
  }
}

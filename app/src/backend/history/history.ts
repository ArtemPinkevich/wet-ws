import type { Entry } from './history.protocol.js';

/** History is an observation store, never an outgoing message queue. */
export class History {
  entries: Entry[] = [];
  private next = 0;
  constructor(
    private readonly maxEntries = 1000,
    private readonly maxBytes = 4 * 1024 * 1024,
  ) {}
  add(input: Omit<Entry, 'id' | 'time'>): { entry: Entry; removed: number[] } {
    const entry: Entry = {
      ...input,
      id: ++this.next,
      time: new Date().toISOString(),
    };
    if (Buffer.byteLength(JSON.stringify(entry), 'utf8') > this.maxBytes) {
      entry.text = `[Содержимое не сохранено: ${Buffer.byteLength(entry.text, 'utf8')} байт]`;
    }
    this.entries.push(entry);
    return { entry, removed: this.trim() };
  }
  private trim(): number[] {
    const removed: number[] = [];
    let bytes = this.entries.reduce(
      (sum, item) => sum + Buffer.byteLength(JSON.stringify(item), 'utf8'),
      0,
    );
    while (this.entries.length > this.maxEntries || bytes > this.maxBytes) {
      const old = this.entries.shift();
      if (!old) break;
      bytes -= Buffer.byteLength(JSON.stringify(old), 'utf8');
      removed.push(old.id);
    }
    return removed;
  }
  update(
    id: number,
    status: string,
    reason?: string,
  ): { entry: Entry; removed: number[] } | undefined {
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) return undefined;
    entry.status = status;
    entry.reason = reason;
    const removed = this.trim();
    return { entry, removed };
  }
  clear(ids: readonly number[]): number[] {
    const selected = new Set(ids);
    const removed = this.entries
      .filter((item) => selected.has(item.id))
      .map((item) => item.id);
    this.entries = this.entries.filter((item) => !selected.has(item.id));
    return removed;
  }
}

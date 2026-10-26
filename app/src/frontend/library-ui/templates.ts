export interface Template {
  id: string;
  name: string;
  text: string;
}
const key = 'wet-ws.templates.v1';
export class Templates {
  items: Template[] = [];
  error = '';
  constructor(private readonly storage: () => Storage) {
    this.reload();
  }
  reload(): void {
    try {
      this.items = this.read();
      this.error = '';
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Хранилище недоступно';
    }
  }
  private read(): Template[] {
    const raw = this.storage().getItem(key);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('items' in value) ||
      !Array.isArray(value.items) ||
      value.items.length > 20
    )
      throw new Error('Сохранённый набор повреждён или имеет другую версию');
    const ids = new Set<string>();
    const items: Template[] = [];
    for (const item of value.items as unknown[]) {
      if (
        !item ||
        typeof item !== 'object' ||
        !('id' in item) ||
        typeof item.id !== 'string' ||
        !item.id ||
        ids.has(item.id) ||
        !('name' in item) ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        !('text' in item) ||
        typeof item.text !== 'string'
      )
        throw new Error('Сохранённый набор повреждён');
      ids.add(item.id);
      items.push({ id: item.id, name: item.name, text: item.text });
    }
    return items;
  }
  save(name: string, text: string): Template {
    if (!name.trim()) throw new Error('Введите название заготовки');
    const items = this.read();
    if (items.length >= 20) throw new Error('Достигнут лимит: 20 заготовок');
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    const item = { id, name, text };
    this.storage().setItem(
      key,
      JSON.stringify({ version: 1, items: [...items, item] }),
    );
    this.items = [...items, item];
    this.error = '';
    return item;
  }
  isStorageKey(value: string | null): boolean {
    return value === null || value === key;
  }
  remove(id: string): boolean {
    const items = this.read();
    const next = items.filter((item) => item.id !== id);
    return this.commit(items, next);
  }
  move(id: string, step: -1 | 1): boolean {
    const items = this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Заготовка уже удалена в другой вкладке');
    const next = items.slice();
    const destination = index + step;
    if (destination >= 0 && destination < items.length) {
      [next[index], next[destination]] = [next[destination]!, next[index]!];
    }
    return this.commit(items, next);
  }
  reorder(id: string, anchorId: string, after: boolean): boolean {
    const items = this.read();
    const item = items.find((entry) => entry.id === id);
    if (!item || !items.some((entry) => entry.id === anchorId))
      throw new Error(
        'Перемещение отменено: заготовка удалена в другой вкладке',
      );
    const next = items.filter((entry) => entry.id !== id);
    if (id === anchorId) return this.commit(items, items);
    const index = next.findIndex((entry) => entry.id === anchorId);
    next.splice(index + (after ? 1 : 0), 0, item);
    return this.commit(items, next);
  }
  private commit(previous: Template[], next: Template[]): boolean {
    const changed =
      previous.length !== next.length ||
      previous.some((item, index) => item.id !== next[index]?.id);
    if (changed)
      this.storage().setItem(key, JSON.stringify({ version: 1, items: next }));
    this.items = next;
    this.error = '';
    return changed;
  }
}

import type { AppModel } from '../app-model/model.js';
const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export function createChatUI(
  model: AppModel,
  render: () => void,
): { render(): void } {
  const chat = el('chat');
  let shown: number[] = [];
  const expanded = new Set<number>();
  el('clear').onclick = () => model.command('clear', undefined, [...shown]);
  return {
    render(): void {
      el('history-notice').textContent = model.state?.historyNotice || '';
      if (!model.state) return;
      el<HTMLButtonElement>('clear').disabled ||=
        model.pendingHas('clear') || model.entries.size === 0;
      const atBottom =
          chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40,
        oldScroll = chat.scrollTop;
      const fragment = document.createDocumentFragment();
      const focusedId = (
        document.activeElement?.closest('article') as HTMLElement | null
      )?.dataset['id'];
      for (const entry of model.entries.values()) {
        const card = document.createElement('article');
        card.className = `entry ${entry.side === 'user' ? (entry.target === 'client' ? 'server' : 'client') : entry.side}`;
        card.dataset['id'] = String(entry.id);
        const time = document.createElement('time');
        time.textContent = new Date(entry.time).toLocaleTimeString();
        card.append(time);
        if (entry.side === 'user') {
          const origin = document.createElement('strong');
          origin.textContent =
            entry.target === 'client'
              ? 'Создано вручную → Клиент'
              : 'Создано вручную → Сервер';
          card.append(origin);
        }
        const content = document.createElement('pre');
        content.textContent =
          entry.text === '' ? '(пустое сообщение)' : entry.text;
        if (expanded.has(entry.id)) content.className = 'expanded';
        card.append(content);
        if (entry.text.split('\n').length > 8 || entry.text.length > 500) {
          const expand = document.createElement('button');
          expand.textContent = expanded.has(entry.id)
            ? 'Свернуть ↑'
            : 'Развернуть ↓';
          expand.onclick = () => {
            if (expanded.has(entry.id)) expanded.delete(entry.id);
            else expanded.add(entry.id);
            render();
          };
          card.append(expand);
        }
        const status = document.createElement('small');
        status.textContent =
          entry.status + (entry.reason ? `: ${entry.reason}` : '');
        card.append(status);
        fragment.append(card);
      }
      chat.replaceChildren(fragment);
      shown = [...model.entries.keys()];
      if (focusedId)
        chat
          .querySelector<HTMLButtonElement>(
            `article[data-id="${focusedId}"] button`,
          )
          ?.focus({ preventScroll: true });
      chat.scrollTop = atBottom ? chat.scrollHeight : oldScroll;
    },
  };
}

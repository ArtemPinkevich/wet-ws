import type { AppModel } from '../app-model/model.js';
import type { Entry } from '../../backend/history/history.protocol.js';
import { el, escapeText, icon, highlight } from '../ui.js';
export function createChatUI(
  model: AppModel,
  actions: {
    selected(): string | null;
    select(key: string): void;
    open(entry: Entry): void;
  },
) {
  const list = el('traffic-list'),
    scroll = el('chat'),
    cards = new Map<number, { node: HTMLElement; signature: string }>(),
    expanded = new Set<number>();
  let instance = '',
    unseen = 0;
  function target(entry: Entry): 'client' | 'server' {
    return entry.side === 'user'
      ? entry.target || 'server'
      : entry.side === 'server'
        ? 'client'
        : 'server';
  }
  function paint(entry: Entry): string {
    const open = expanded.has(entry.id);
    let visible = entry.text;
    if (open) {
      try {
        visible = JSON.stringify(JSON.parse(visible), null, 2);
      } catch {
        /* Literal text remains literal. */
      }
    } else visible = visible.split('\n').slice(0, 8).join('\n').slice(0, 500);
    if (entry.side === 'event') return `<p>${escapeText(entry.text)}</p>`;
    const to = target(entry),
      name = to === 'client' ? 'Клиент' : 'Сервер',
      disabled =
        !model.synced ||
        model.state?.[to] !== 'connected' ||
        model.pendingHas('send') ||
        entry.payloadUnavailable;
    const status = entry.status + (entry.reason ? ': ' + entry.reason : '');
    return `<header class="entry-header"><div class="chat-expand-slot">${entry.text && !entry.payloadUnavailable ? `<button class="icon-button chat-expand" data-expand="${entry.id}" aria-expanded="${open}" title="${open ? 'Свернуть' : 'Раскрыть содержимое'}" aria-label="${open ? 'Свернуть сообщение' : 'Раскрыть сообщение'}">${icon(open ? 'fold' : 'expand')}</button>` : ''}<button class="icon-button entry-open" data-open="${entry.id}" ${entry.payloadUnavailable ? 'disabled' : ''} title="Открыть исходный текст в рабочей области" aria-label="Открыть сообщение #${entry.id}">${icon('inspect')}</button></div><time class="entry-time">${entry.side === 'user' ? `<span class="manual-mark" role="img" aria-label="Создано вручную → ${name}" title="Создано вручную">${icon('send')}</span>` : ''}${escapeText(new Date(entry.time).toLocaleTimeString())}</time><div class="chat-commands"><button class="chat-repeat" data-repeat="${entry.id}" ${disabled ? 'disabled' : ''} aria-label="Отправить как новое ручное сообщение → ${name}" title="Новое ручное сообщение → ${name}">${icon('send')}<span>${name}</span></button></div></header><pre class="payload-preview" ${open ? 'tabindex="0"' : ''}>${entry.text === '' ? '<span class="muted">Пустая строка</span>' : highlight(visible)}</pre>${entry.payloadUnavailable ? '<p class="entry-meta">Исходный текст не сохранён — открытие и повтор недоступны</p>' : entry.reason || entry.status !== 'Передано на отправку' ? `<p class="entry-meta">${escapeText(status)}</p>` : ''}`;
  }
  function updateNew(): void {
    el('new-count').textContent = unseen
      ? `Новых сообщений: ${unseen}`
      : 'История обмена';
    el('new-events').classList.toggle('has-new', unseen > 0);
  }
  el('latest').onclick = () => {
    scroll.scrollTop = scroll.scrollHeight;
    unseen = 0;
    updateNew();
  };
  scroll.addEventListener(
    'scroll',
    () => {
      if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40) {
        unseen = 0;
        updateNew();
      }
    },
    { passive: true },
  );
  el('clear').onclick = () =>
    model.command('clear', undefined, [...cards.keys()]);
  list.onclick = (event) => {
    const source = event.target as HTMLElement,
      button = source.closest<HTMLButtonElement>('button');
    if (button?.disabled) return;
    const card = source.closest<HTMLElement>('[data-id]');
    if (!card) return;
    const entry = model.entries.get(Number(card.dataset['id']));
    if (!entry || entry.side === 'event') return;
    if (button?.dataset['open']) {
      actions.open(entry);
      return;
    }
    if (button?.dataset['repeat']) {
      if (!entry.payloadUnavailable)
        model.sendMessage(target(entry), entry.text);
      return;
    }
    if (button?.dataset['expand']) {
      const top = scroll.scrollTop;
      if (expanded.has(entry.id)) expanded.delete(entry.id);
      else expanded.add(entry.id);
      const record = cards.get(entry.id);
      if (record) record.signature = '';
      render();
      scroll.scrollTop = top;
      cards
        .get(entry.id)
        ?.node.querySelector<HTMLButtonElement>('[data-expand]')
        ?.focus({ preventScroll: true });
      return;
    }
    if (window.getSelection()?.toString()) return;
    actions.select(`${model.state?.instance}:${entry.id}`);
    render();
  };
  list.onkeydown = (event) => {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      (event.target as HTMLElement).matches('article[data-id]')
    ) {
      event.preventDefault();
      actions.select(
        `${model.state?.instance}:${(event.target as HTMLElement).dataset['id']}`,
      );
      render();
    }
  };
  function render(): void {
    const pinned =
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40,
      top = scroll.scrollTop;
    if (instance !== model.state?.instance) {
      cards.clear();
      expanded.clear();
      list.replaceChildren();
      instance = model.state?.instance || '';
      unseen = 0;
    }
    let added = 0;
    for (const [id, record] of cards)
      if (!model.entries.has(id)) {
        record.node.remove();
        cards.delete(id);
        expanded.delete(id);
      }
    for (const entry of model.entries.values()) {
      let record = cards.get(entry.id);
      if (!record) {
        const node = document.createElement('article');
        node.dataset['id'] = String(entry.id);
        node.tabIndex = entry.side === 'event' ? -1 : 0;
        record = { node, signature: '' };
        cards.set(entry.id, record);
        list.append(node);
        added++;
      }
      const to = target(entry),
        key = `${model.state?.instance}:${entry.id}`,
        signature = JSON.stringify([
          entry,
          expanded.has(entry.id),
          model.synced,
          model.state?.[to],
          model.pendingHas('send'),
        ]);
      if (signature !== record.signature) {
        const focused = record.node.contains(document.activeElement)
          ? (document.activeElement as HTMLElement).dataset
          : undefined;
        record.node.innerHTML = paint(entry);
        record.signature = signature;
        if (focused) {
          const action = focused['expand']
            ? 'expand'
            : focused['open']
              ? 'open'
              : 'repeat';
          record.node
            .querySelector<HTMLButtonElement>(`[data-${action}]`)
            ?.focus({ preventScroll: true });
        }
      }
      record.node.className = `entry traffic-entry ${entry.side === 'event' ? 'event' : entry.side === 'client' || (entry.side === 'user' && entry.target === 'server') ? 'from-client client' : 'from-server server'} ${entry.side === 'user' ? 'manual user' : ''} ${expanded.has(entry.id) ? 'expanded' : ''} ${actions.selected() === key ? 'selected' : ''}`;
      record.node.setAttribute(
        'aria-current',
        String(actions.selected() === key),
      );
      record.node.setAttribute(
        'aria-description',
        entry.status + (entry.reason ? ': ' + entry.reason : ''),
      );
      record.node.title =
        entry.status + (entry.reason ? ': ' + entry.reason : '');
    }
    el<HTMLButtonElement>('clear').disabled =
      !model.synced || model.pendingHas('clear') || cards.size === 0;
    el('history-notice').textContent = model.state?.historyNotice || '';
    if (added && pinned) scroll.scrollTop = scroll.scrollHeight;
    else {
      scroll.scrollTop = top;
      unseen += added;
    }
    if (!cards.size) unseen = 0;
    updateNew();
  }
  return { render };
}

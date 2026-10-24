import type { AppModel } from '../app-model/model.js';
import type { Template, Templates } from './templates.js';
import { el, escapeText, icon } from '../ui.js';
export function createLibraryUI(
  model: AppModel,
  templates: Templates,
  actions: {
    load(item: Template): void;
    target(): 'client' | 'server';
    setTarget(target: 'client' | 'server'): void;
    selected(): string | null;
  },
) {
  let signature = '';
  el<HTMLSelectElement>('quick-target').onchange = () =>
    actions.setTarget(
      el<HTMLSelectElement>('quick-target').value === 'client'
        ? 'client'
        : 'server',
    );
  el('template-list').onclick = (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-template],button[data-quick]',
    );
    if (!button || button.disabled) return;
    const item = templates.items.find(
      (t) => t.id === (button.dataset['template'] || button.dataset['quick']),
    );
    if (!item) return;
    if (button.dataset['template']) actions.load(item);
    else model.sendMessage(actions.target(), item.text);
  };
  return {
    render(): void {
      const target = actions.target(),
        name = target === 'client' ? 'Клиент' : 'Сервер';
      el<HTMLSelectElement>('quick-target').value = target;
      el('template-count').textContent = `${templates.items.length}/20`;
      el('library-note').hidden = false;
      el('library-note').textContent = templates.error
        ? 'Библиотека недоступна: ' + templates.error
        : templates.items.length >= 20
          ? 'Лимит: 20 заготовок'
          : 'Локальная библиотека этого браузера';
      const next = JSON.stringify([templates.items, actions.selected()]);
      if (next !== signature) {
        signature = next;
        el('template-list').innerHTML = templates.items.length
          ? templates.items
              .map(
                (t) =>
                  `<article class="template-item ${actions.selected() === t.id ? 'active' : ''}"><button class="template-open" data-template="${escapeText(t.id)}">${escapeText(t.name)}</button><p class="template-preview">${escapeText(t.text.slice(0, 300))}</p><div class="template-bottom"><button data-quick="${escapeText(t.id)}">${icon('send')}<span>→ ${name}</span></button></div></article>`,
              )
              .join('')
          : '<p class="empty-traffic">Заготовок пока нет. Сохраните текст из рабочей области.</p>';
      }
      document
        .querySelectorAll<HTMLButtonElement>('[data-quick]')
        .forEach((button) => {
          button.disabled =
            !model.synced ||
            model.state?.[target] !== 'connected' ||
            model.pendingHas('send') ||
            !!templates.error;
          button.title = `Новое ручное сообщение → ${name}`;
          button.querySelector('span')!.textContent = '→ ' + name;
        });
      document
        .querySelectorAll<HTMLButtonElement>('[data-template]')
        .forEach((button) => {
          button.disabled = !!templates.error;
        });
    },
  };
}

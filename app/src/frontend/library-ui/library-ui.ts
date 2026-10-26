import type { AppModel } from '../app-model/model.js';
import type { Template, Templates } from './templates.js';
import { el, escapeText, icon, notify } from '../ui.js';
import { bindTemplateDrag } from './drag.js';
export function createLibraryUI(
  model: AppModel,
  templates: Templates,
  actions: {
    load(item: Template): void;
    target(): 'client' | 'server';
    setTarget(target: 'client' | 'server'): void;
    selected(): string | null;
    changed(): void;
  },
) {
  let signature = '';
  const list = el('template-list');
  const dialog = el<HTMLDialogElement>('delete-dialog');
  let deleteId: string | null = null;
  function focus(id?: string, action = 'template', reveal = false): void {
    const card = id
      ? list.querySelector(`[data-template-id="${CSS.escape(id)}"]`)
      : null;
    const button = card?.querySelector<HTMLButtonElement>(`[data-${action}]`);
    const target =
      button && !button.disabled
        ? button
        : (card?.querySelector<HTMLElement>('[data-template]') ??
          list.querySelector<HTMLElement>('[data-template]') ??
          list.querySelector<HTMLElement>('#library-empty'));
    target?.focus({ preventScroll: true });
    if (reveal) target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function mutate(id: string, operation: () => boolean): void {
    try {
      if (operation()) notify('Порядок заготовок сохранён.');
    } catch (error) {
      templates.reload();
      notify(
        error instanceof Error ? error.message : 'Не удалось изменить порядок',
      );
    }
    actions.changed();
    focus(id, 'drag-handle', true);
  }
  const cancelDrag = bindTemplateDrag(
    list,
    (id, anchor, after) =>
      mutate(id, () => templates.reorder(id, anchor, after)),
    (id) => focus(id, 'drag-handle'),
  );
  list.addEventListener('keydown', (event) => {
    const handle = (event.target as Element).closest<HTMLButtonElement>(
      '[data-drag-handle]',
    );
    if (
      !handle ||
      handle.disabled ||
      !['ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    event.preventDefault();
    cancelDrag();
    const id = handle.dataset['dragHandle']!;
    mutate(id, () => templates.move(id, event.key === 'ArrowUp' ? -1 : 1));
  });
  function cancelDelete(): void {
    const id = deleteId;
    deleteId = null;
    dialog.close();
    focus(id ?? templates.items[0]?.id, 'delete');
  }
  el('delete-cancel').onclick = cancelDelete;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelDelete();
  });
  el('delete-confirm').onclick = () => {
    if (!deleteId) return;
    const index = templates.items.findIndex((item) => item.id === deleteId);
    try {
      const removed = templates.remove(deleteId);
      deleteId = null;
      dialog.close();
      actions.changed();
      focus(
        templates.items[
          Math.max(0, Math.min(index, templates.items.length - 1))
        ]?.id,
      );
      notify(
        removed
          ? 'Заготовка удалена. Открытый текст сохранён.'
          : 'Заготовка уже удалена в другой вкладке.',
      );
    } catch (error) {
      el('delete-error').textContent =
        error instanceof Error ? error.message : 'Не удалось удалить заготовку';
    }
  };
  el<HTMLSelectElement>('quick-target').onchange = () =>
    actions.setTarget(
      el<HTMLSelectElement>('quick-target').value === 'client'
        ? 'client'
        : 'server',
    );
  list.onclick = (event) => {
    if ((event.target as Element).closest('#library-empty')) {
      el('new-draft').click();
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-template],button[data-quick],button[data-delete]',
    );
    if (!button || button.disabled) return;
    const item = templates.items.find(
      (t) =>
        t.id ===
        (button.dataset['template'] ||
          button.dataset['quick'] ||
          button.dataset['delete']),
    );
    if (!item) return;
    if (button.dataset['delete']) {
      cancelDrag();
      templates.reload();
      actions.changed();
      if (templates.error) {
        notify(templates.error);
        return;
      }
      const current = templates.items.find((entry) => entry.id === item.id);
      if (!current) {
        notify('Заготовка уже удалена в другой вкладке.');
        return;
      }
      deleteId = current.id;
      el('delete-name').textContent = current.name;
      el('delete-error').textContent = '';
      dialog.showModal();
      el('delete-cancel').focus();
    } else if (button.dataset['template']) actions.load(item);
    else model.sendMessage(actions.target(), item.text);
  };
  return {
    cancelDrag,
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
        const active = document.activeElement as HTMLElement | null;
        const activeId =
          active?.closest<HTMLElement>('[data-template-id]')?.dataset[
            'templateId'
          ];
        const action = active?.hasAttribute('data-drag-handle')
          ? 'drag-handle'
          : active?.hasAttribute('data-delete')
            ? 'delete'
            : active?.hasAttribute('data-quick')
              ? 'quick'
              : 'template';
        cancelDrag();
        signature = next;
        el('template-list').innerHTML = templates.items.length
          ? templates.items
              .map(
                (t) =>
                  `<article data-template-id="${escapeText(t.id)}" class="template-item ${actions.selected() === t.id ? 'active' : ''}"><div class="template-title-row"><button class="template-drag-handle" data-drag-handle="${escapeText(t.id)}" aria-label="Переместить: ${escapeText(t.name)}" title="Перетащите за захват; с клавиатуры — стрелки вверх и вниз">${icon('grip')}</button><button class="template-open" data-template="${escapeText(t.id)}">${escapeText(t.name)}</button><button class="template-delete" data-delete="${escapeText(t.id)}" aria-label="Удалить: ${escapeText(t.name)}" title="Удалить">${icon('trash')}</button></div><p class="template-preview">${escapeText(t.text.slice(0, 300))}</p><div class="template-bottom"><button data-quick="${escapeText(t.id)}">${icon('send')}<span>→ ${name}</span></button></div></article>`,
              )
              .join('')
          : '<div class="library-empty"><p>Нет заготовок</p><button id="library-empty">Создать черновик</button></div>';
        if (activeId && !dialog.open)
          focus(
            templates.items.some((t) => t.id === activeId)
              ? activeId
              : templates.items[0]?.id,
            action,
          );
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
        .querySelectorAll<HTMLButtonElement>(
          '[data-template],[data-drag-handle],[data-delete]',
        )
        .forEach((button) => {
          button.disabled = !!templates.error;
        });
    },
  };
}

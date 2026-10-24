import type { AppModel } from '../app-model/model.js';
import type { Entry } from '../../backend/history/history.protocol.js';
import type { Template, Templates } from '../library-ui/templates.js';
import { el, highlight, notify } from '../ui.js';

/** Textarea exposes LF lines. Preserve untouched CR/CRLF bytes from the source. */
export function applyTextareaEdit(raw: string, next: string): string {
  const previous = raw.replace(/\r\n?/g, '\n');
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  let end = 0;
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  const offset = (index: number): number => {
    let at = 0;
    for (let n = 0; n < index; n++, at++)
      if (raw[at] === '\r' && raw[at + 1] === '\n') at++;
    return at;
  };
  return (
    raw.slice(0, offset(start)) +
    next.slice(start, next.length - end) +
    raw.slice(offset(previous.length - end))
  );
}
export function createMessageUI(
  model: AppModel,
  templates: Templates,
  changed: () => void,
  selected: (key: string | null) => void,
  show: () => void,
) {
  const text = el<HTMLTextAreaElement>('message-text'),
    target = el<HTMLSelectElement>('message-target');
  let raw = '',
    base = '',
    title = 'Новый черновик',
    source = '',
    templateId: string | null = null;
  let pending: (() => void) | undefined,
    originFocus: HTMLElement | null = null;
  const dialog = el<HTMLDialogElement>('dirty-dialog');
  const dirty = (): boolean => raw !== base;
  function syncScroll(): void {
    el('highlight').scrollTop = text.scrollTop;
    el('highlight').scrollLeft = text.scrollLeft;
    el('line-numbers').style.transform = `translateY(${-text.scrollTop}px)`;
  }
  function paint(): void {
    el('highlight').innerHTML =
      highlight(text.value) + (text.value.endsWith('\n') ? '\n ' : '');
    el('line-numbers').textContent = Array.from(
      { length: text.value.split('\n').length },
      (_, i) => i + 1,
    ).join('\n');
    el('editor-mode').textContent = dirty()
      ? 'Черновик · изменён'
      : source
        ? 'Сообщение'
        : 'Черновик';
    el('rail-dirty').hidden = !dirty();
    el('copy-note').hidden = !source;
    el('text-size').textContent = `${new TextEncoder().encode(raw).length} Б`;
    const lines = text.value.slice(0, text.selectionStart).split('\n');
    el('cursor-status').textContent =
      `Ln ${lines.length}, Col ${(lines.at(-1)?.length || 0) + 1}`;
    syncScroll();
  }
  function replace(action: () => void): void {
    if (!dirty()) {
      action();
      return;
    }
    if (dialog.open) return;
    originFocus = document.activeElement as HTMLElement | null;
    pending = action;
    dialog.showModal();
    el('dirty-cancel').focus();
  }
  function load(
    value: string,
    label: string,
    description: string,
    key: string | null,
    id: string | null = null,
  ): void {
    replace(() => {
      base = value;
      raw = value;
      title = label;
      source = description;
      templateId = id;
      text.value = value;
      el('editor-title').textContent = title;
      el('editor-subtitle').textContent = source || 'Новый literal текст';
      el('save-form').hidden = true;
      show();
      text.focus();
      text.setSelectionRange(0, 0);
      text.scrollTop = 0;
      text.scrollLeft = 0;
      selected(key);
      paint();
      changed();
    });
  }
  function cancel(): void {
    pending = undefined;
    dialog.close();
    (originFocus?.isConnected ? originFocus : text).focus({
      preventScroll: true,
    });
  }
  el('dirty-cancel').onclick = cancel;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancel();
  });
  el('dirty-confirm').onclick = () => {
    const action = pending;
    pending = undefined;
    dialog.close();
    action?.();
  };
  text.addEventListener('input', () => {
    raw = applyTextareaEdit(raw, text.value);
    paint();
  });
  text.addEventListener('scroll', syncScroll, { passive: true });
  for (const event of ['click', 'keyup', 'select'])
    text.addEventListener(event, paint);
  el('new-draft').onclick = () => load('', 'Новый черновик', '', null);
  el('send-message').onclick = () => model.sendMessage(getTarget(), raw);
  el<HTMLInputElement>('auto-forward').onchange = (event) => {
    model.setAutoForward((event.target as HTMLInputElement).checked);
    el<HTMLInputElement>('auto-forward').checked =
      model.state?.autoForward ?? false;
  };
  target.onchange = changed;
  el('save-toggle').onclick = () => {
    const form = el('save-form');
    form.hidden = !form.hidden;
    if (!form.hidden) {
      el<HTMLInputElement>('template-name').value = templateId ? title : '';
      el('save-error').textContent = '';
      el('template-name').focus();
    }
  };
  el('cancel-save').onclick = () => {
    el('save-form').hidden = true;
    el('save-toggle').focus();
  };
  el<HTMLFormElement>('save-form').onsubmit = (event) => {
    event.preventDefault();
    try {
      const item = templates.save(
        el<HTMLInputElement>('template-name').value,
        raw,
      );
      templateId = item.id;
      title = item.name;
      base = raw;
      el('editor-title').textContent = title;
      el('save-form').hidden = true;
      paint();
      changed();
      notify('Заготовка сохранена в этом браузере.');
    } catch (error) {
      el('save-error').textContent =
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить заготовку';
    }
  };
  function getTarget(): 'client' | 'server' {
    return target.value === 'client' ? 'client' : 'server';
  }
  return {
    getTarget,
    setTarget(value: 'client' | 'server'): void {
      target.value = value;
      changed();
    },
    templateId: () => templateId,
    open(entry: Entry): void {
      if (entry.side === 'event' || entry.payloadUnavailable) {
        notify(
          'Полный исходный текст не сохранён в истории. Открытие и повтор недоступны.',
        );
        return;
      }
      load(
        entry.text,
        entry.side === 'user'
          ? 'Ручное сообщение'
          : entry.side === 'client'
            ? 'Сообщение клиента'
            : 'Сообщение сервера',
        `Копия #${entry.id} · оригинал не изменяется`,
        `${model.state?.instance}:${entry.id}`,
      );
    },
    loadTemplate(item: Template): void {
      load(
        item.text,
        item.name,
        'Заготовка · редактируемая копия',
        null,
        item.id,
      );
    },
    render(): void {
      const toggle = el<HTMLInputElement>('auto-forward');
      toggle.disabled = !model.synced || model.pendingHas('set-auto-forward');
      toggle.indeterminate = !model.synced;
      toggle.checked = model.synced && (model.state?.autoForward ?? false);
      el('auto-label').textContent = !model.synced
        ? '?'
        : model.state?.autoForward
          ? 'ON'
          : 'OFF';
      el('forward-state').textContent = !model.synced
        ? 'Состояние пересылки неизвестно'
        : model.state?.autoForward
          ? 'Автопересылка включена'
          : 'Автопересылка выключена; наблюдение продолжается';
      const reason = !model.synced
        ? 'Нет связи с сервисом. Локальный редактор и заготовки доступны.'
        : model.state?.[getTarget()] !== 'connected'
          ? 'Выбранный получатель не подключён'
          : model.pendingHas('send')
            ? 'Ожидаем принятия команды; это не подтверждение доставки'
            : '';
      el<HTMLButtonElement>('send-message').disabled = !!reason;
      el('send-hint').textContent = reason;
      el('send-hint').hidden = !reason;
      el<HTMLButtonElement>('save-toggle').disabled =
        !!templates.error || templates.items.length >= 20;
      el<HTMLButtonElement>('save-template').disabled =
        !!templates.error || templates.items.length >= 20;
    },
  };
}

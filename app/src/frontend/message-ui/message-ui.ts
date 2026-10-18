import type { AppModel } from '../app-model/model.js';
const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export function createMessageUI(model: AppModel): { render(): void } {
  const toggle = el<HTMLInputElement>('auto-forward');
  const text = el<HTMLTextAreaElement>('message-text');
  const target = el<HTMLSelectElement>('message-target');
  const button = el<HTMLButtonElement>('send-message');
  const selected = (): 'client' | 'server' =>
    target.value === 'client' ? 'client' : 'server';
  toggle.onchange = () => {
    model.setAutoForward(toggle.checked);
    toggle.checked = model.state?.autoForward ?? false;
  };
  button.onclick = () => model.sendMessage(selected(), text.value);
  const render = (): void => {
    toggle.disabled = !model.synced || model.pendingHas('set-auto-forward');
    toggle.checked = model.synced && (model.state?.autoForward ?? false);
    toggle.indeterminate = !model.synced;
    el('forward-state').textContent = !model.synced
      ? 'Состояние пересылки неизвестно'
      : model.state?.autoForward
        ? 'Автопересылка включена'
        : 'Автопересылка выключена; наблюдение продолжается';
    const ready = model.state?.[selected()] === 'connected';
    button.disabled = !model.synced || !ready || model.pendingHas('send');
    el('send-hint').textContent = !model.synced
      ? 'Для отправки восстановите связь с сервисом. Черновик сохранён в этой вкладке.'
      : !ready
        ? 'Выбранный получатель не подключён'
        : model.pendingHas('send')
          ? 'Ожидаем принятия команды; это не подтверждение доставки'
          : 'Enter — новая строка. Текст передаётся буквально, включая пустое сообщение.';
  };
  target.onchange = render;
  return { render };
}

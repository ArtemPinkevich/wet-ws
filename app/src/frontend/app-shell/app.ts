import { AppModel } from '../app-model/model.js';
import { startControl } from '../control-client/control-client.js';
import { createConnectionUI } from '../connection-ui/connection-ui.js';
import { createMessageUI } from '../message-ui/message-ui.js';
import { createChatUI } from '../chat-ui/chat-ui.js';
const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const model = new AppModel(render);
const connectionUI = createConnectionUI(model);
const chatUI = createChatUI(model, render);
const messageUI = createMessageUI(model);
function render(): void {
  el('control-state').textContent = model.synced
    ? '● Интерфейс синхронизирован'
    : 'Связь с сервисом потеряна';
  if (model.state)
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      'button[data-command]',
    ))
      button.disabled = !model.synced;
  connectionUI.render();
  chatUI.render();
  messageUI.render();
}
const stopControl = startControl(model);
window.addEventListener('pagehide', stopControl, { once: true });

const splitter = el('splitter'),
  settingsPanel = el('settings');
function panelWidth(value: number): void {
  const maximum = Math.max(290, Math.min(720, innerWidth - 380));
  const width = Math.round(Math.max(290, Math.min(maximum, value)));
  settingsPanel.style.width = `${width}px`;
  splitter.setAttribute('aria-valuenow', String(width));
  splitter.setAttribute('aria-valuemax', String(maximum));
}
splitter.onkeydown = (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  panelWidth(
    settingsPanel.getBoundingClientRect().width +
      (event.key === 'ArrowLeft' ? -10 : 10),
  );
};
splitter.onpointerdown = (event) => {
  splitter.setPointerCapture(event.pointerId);
  const start = event.clientX,
    width = settingsPanel.getBoundingClientRect().width;
  splitter.onpointermove = (move) => panelWidth(width + move.clientX - start);
  splitter.onpointerup = () => {
    splitter.onpointermove = null;
  };
};

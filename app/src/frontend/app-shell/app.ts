import { AppModel } from '../app-model/model.js';
import { startControl } from '../control-client/control-client.js';
import { createConnectionUI } from '../connection-ui/connection-ui.js';
import { createMessageUI } from '../message-ui/message-ui.js';
import { createChatUI } from '../chat-ui/chat-ui.js';
import { createLayout } from '../workbench-ui/layout.js';
import { Templates } from '../library-ui/templates.js';
import { createLibraryUI } from '../library-ui/library-ui.js';
import { el } from '../ui.js';
let selected: string | null = null;
const model = new AppModel(render),
  templates = new Templates(() => window.localStorage),
  layout = createLayout(),
  connectionUI = createConnectionUI(model);
const messageUI = createMessageUI(
  model,
  templates,
  render,
  (key) => {
    selected = key;
  },
  () => layout.showEditor(),
);
const libraryUI = createLibraryUI(model, templates, {
  load: (item) => messageUI.loadTemplate(item),
  target: messageUI.getTarget,
  setTarget: (value) => messageUI.setTarget(value),
  selected: messageUI.templateId,
  changed: render,
});
const chatUI = createChatUI(model, {
  selected: () => selected,
  select: (key) => {
    selected = key;
  },
  open: (entry) => messageUI.open(entry),
});
function render(): void {
  el('control-state').textContent = model.synced
    ? '● Интерфейс синхронизирован'
    : 'Связь с сервисом потеряна';
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    'button[data-command]',
  ))
    button.disabled = !model.synced;
  connectionUI.render();
  messageUI.render();
  libraryUI.render();
  chatUI.render();
}
window.addEventListener('storage', (event) => {
  if (templates.isStorageKey(event.key)) {
    libraryUI.cancelDrag();
    templates.reload();
    render();
  }
});
render();
const stopControl = startControl(model);
window.addEventListener('pagehide', stopControl, { once: true });

import type { AppModel } from '../app-model/model.js';
import type { Settings } from '../../backend/connection/connection.protocol.js';
const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export function createConnectionUI(model: AppModel): { render(): void } {
  const url = el<HTMLInputElement>('url'),
    host = el<HTMLInputElement>('host'),
    port = el<HTMLInputElement>('port'),
    protocol = el<HTMLInputElement>('protocol');
  let initialized = false;
  const settings = (): Settings => ({
    url: url.value,
    host: host.value,
    port: Number(port.value),
    protocol: protocol.value.trim(),
  });
  el('server-action').onclick = () =>
    model.command(
      model.state?.server === 'disconnected' ? 'connect' : 'disconnect-server',
      settings(),
    );
  el('client-action').onclick = () =>
    model.command(
      model.state?.client === 'connected' ? 'disconnect-client' : 'listen',
      settings(),
    );
  el('listener-stop').onclick = () => model.command('stop-listener');
  return {
    render(): void {
      const state = model.state;
      el('error').textContent = model.error || state?.error || '';
      if (!state) return;
      if (!initialized) {
        url.value = state.settings.url;
        host.value = state.settings.host;
        port.value = String(state.settings.port);
        protocol.value = state.settings.protocol;
        initialized = true;
      }
      const serverActive = state.server !== 'disconnected',
        clientActive = state.listener;
      if (serverActive) url.value = state.settings.url;
      if (clientActive) {
        host.value = state.settings.host;
        port.value = String(state.settings.port);
      }
      if (serverActive || clientActive)
        protocol.value = state.settings.protocol;
      url.readOnly = serverActive;
      host.readOnly = clientActive;
      port.readOnly = clientActive;
      protocol.readOnly = serverActive || clientActive;
      const phase = (value: string) =>
        value === 'connected'
          ? 'Подключён'
          : value === 'connecting'
            ? 'Подключаемся…'
            : 'Не подключён';
      el('server-state').textContent =
        'Сервер · ' +
        (model.synced ? phase(state.server) : 'Состояние неизвестно');
      el('client-state').textContent =
        'Клиент · ' +
        (model.synced ? phase(state.client) : 'Состояние неизвестно');
      for (const side of ['client', 'server'] as const) {
        el(side + '-state').removeAttribute('aria-label');
        el(side + '-state').removeAttribute('title');
        el(side + '-state').classList.toggle(
          'offline',
          !model.synced || state[side] !== 'connected',
        );
      }
      el('listener-state').textContent = state.listener
        ? 'Приём новых клиентов открыт'
        : 'Приём закрыт';
      // Use the UI host for wildcard binding: a container's private IP is not its published address.
      const clientHost =
        state.settings.host === '0.0.0.0' || state.settings.host === '::'
          ? location.hostname
          : state.settings.host;
      el('client-address').textContent = state.listener
        ? `ws://${clientHost.includes(':') ? `[${clientHost}]` : clientHost}:${state.settings.port}`
        : '';
      el('server-action').textContent = serverActive
        ? 'Отключить сервер'
        : 'Подключить сервер';
      el('client-action').textContent =
        state.client === 'connected'
          ? 'Отключить клиента'
          : state.listener
            ? 'Ожидаем клиента'
            : 'Начать приём';
      el('listener-stop').hidden = !state.listener;
      el<HTMLButtonElement>('server-action').disabled ||= model.pendingHas(
        serverActive ? 'disconnect-server' : 'connect',
      );
      el<HTMLButtonElement>('client-action').disabled ||=
        (state.listener && state.client !== 'connected') ||
        model.pendingHas(
          state.client === 'connected' ? 'disconnect-client' : 'listen',
        );
    },
  };
}

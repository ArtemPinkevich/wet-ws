import { WebSocket } from 'ws';
import type { Application } from '../application/application.js';
import type { ControlServerMessage } from '../../protocol.js';
import {
  commandRequestId,
  isControlClientMessage,
} from './control.validation.js';
/** Control transport validates commands before application dispatch. */
export function bindControl(client: WebSocket, application: Application): void {
  const send = (message: ControlServerMessage): void => {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(message));
  };
  client.on('error', () => {});
  const unsubscribe = application.subscribe(send);
  client.once('close', unsubscribe);
  client.on('message', (data, binary) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (binary) {
      send({ type: 'error', message: 'Нужна текстовая команда' });
      client.close(1003, 'Text control messages required');
      return;
    }
    let value: unknown;
    try {
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      send({ type: 'error', message: 'Неверная команда' });
      return;
    }
    if (!isControlClientMessage(value)) {
      const id = commandRequestId(value);
      if (id !== undefined)
        send({ type: 'result', id, ok: false, error: 'Неверная команда' });
      else send({ type: 'error', message: 'Неверная команда' });
      return;
    }
    const command = value;
    void application
      .command(command)
      .then(() => {
        send({ type: 'result', id: command.id, ok: true });
      })
      .catch((error: unknown) => {
        send({
          type: 'result',
          id: command.id,
          ok: false,
          error: error instanceof Error ? error.message : 'Ошибка команды',
        });
      });
  });
}

import type { AppModel } from '../app-model/model.js';
import type { ControlServerMessage } from '../../protocol.js';
import { isSessionUpdate } from '../../backend/application/application.protocol.js';
import { isControlReply } from '../../backend/control/control.protocol.js';
export function parseControlServerMessage(text: string): ControlServerMessage {
  const value: unknown = JSON.parse(text);
  if (!isSessionUpdate(value) && !isControlReply(value))
    throw new Error('Неверное сообщение сервиса');
  return value;
}
/** Browser transport; invalid packets invalidate the model before delayed reconnect. */
export function startControl(model: AppModel): () => void {
  let socket: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  function connect(): void {
    if (disposed) return;
    const current = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/control`,
    );
    socket = current;
    let failed = false;
    const invalidate = (): void => {
      if (failed || socket !== current) return;
      failed = true;
      model.invalidate();
      current.close();
    };
    current.onopen = () => {
      if (socket === current && !failed)
        model.connected({
          send: (text) => current.send(text),
          close: () => {
            failed = true;
            current.close();
          },
        });
    };
    current.onmessage = (event) => {
      if (socket !== current || failed) return;
      try {
        if (typeof event.data !== 'string')
          throw new Error('Нужен текстовый пакет');
        model.receive(parseControlServerMessage(event.data));
      } catch {
        invalidate();
      }
    };
    current.onerror = invalidate;
    current.onclose = () => {
      if (socket !== current) return;
      failed = true;
      model.disconnected();
      if (!disposed) {
        clearTimeout(retry);
        retry = setTimeout(connect, 1000);
      }
    };
  }
  connect();
  return () => {
    disposed = true;
    clearTimeout(retry);
    socket?.close();
  };
}

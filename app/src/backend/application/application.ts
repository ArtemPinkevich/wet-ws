import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { ConnectionPort, SendTarget } from '../connection/ports.js';
import { History } from '../history/history.js';
import { forward } from '../message-flow/forward.js';
import type { MessageFlowCommand } from '../message-flow/message-flow.protocol.js';
import type {
  ConnectionCommand,
  Side,
} from '../connection/connection.protocol.js';
import type {
  ClearHistoryCommand,
  Entry,
} from '../history/history.protocol.js';
import type { SessionState, SessionUpdate } from './application.protocol.js';

export class Application {
  readonly history = new History();
  readonly state: SessionState = {
    instance: randomUUID(),
    revision: 0,
    session: 0,
    listener: false,
    autoForward: true,
    client: 'disconnected',
    server: 'disconnected',
    settings: { url: '', host: '0.0.0.0', port: 8081, protocol: '' },
    clientAddress: '',
    error: null,
  };
  private subscribers = new Set<(update: SessionUpdate) => void>();
  private busy = false;
  private stopped = false;
  constructor(
    private readonly connections: ConnectionPort,
    private readonly observe?: (event: {
      event: 'receive' | 'send';
      connectionId: number;
      text: string;
      bytes: number;
    }) => void,
  ) {
    connections.events = {
      phase: (side, phase, reason) => {
        this.state[side] = phase;
        this.event(reason);
      },
      text: (side, text, generation, bytes) =>
        this.receive(side, text, generation, bytes),
      event: (reason) => this.event(reason),
      error: (reason) => {
        this.state.error = reason;
        this.publish();
      },
      binary: () => {
        this.state.error = 'Бинарное сообщение не поддерживается';
        connections.disconnect('client');
        connections.disconnect('server');
        this.event('Соединения закрыты: бинарное сообщение не поддерживается');
      },
    };
  }
  subscribe(callback: (update: SessionUpdate) => void): () => void {
    // No await between snapshot and subscribing: both use the same event-loop turn.
    this.subscribers.add(callback);
    callback({
      type: 'snapshot',
      state: structuredClone(this.state),
      entries: structuredClone(this.history.entries),
    });
    return () => this.subscribers.delete(callback);
  }
  private publish(
    entries: Entry[] = [],
    removed: number[] = [],
    change: 'added' | 'updated' = 'added',
  ): void {
    ++this.state.revision;
    const update: SessionUpdate = {
      type: 'change',
      state: structuredClone(this.state),
      entries: structuredClone(entries).map((entry) => ({ ...entry, change })),
      removed,
    };
    for (const callback of this.subscribers) callback(update);
  }
  private event(text: string): void {
    const { entry, removed } = this.history.add({
      session: this.state.session,
      side: 'event',
      text,
      status: '',
    });
    this.historyChange(entry, removed);
  }
  private historyChange(
    entry: Entry,
    removed: number[],
    change: 'added' | 'updated' = 'added',
  ): void {
    if (removed.length)
      this.state.historyNotice =
        'Старые записи вытеснены: достигнут бюджет истории';
    this.publish(removed.includes(entry.id) ? [] : [entry], removed, change);
  }
  async command(
    command: ConnectionCommand | ClearHistoryCommand | MessageFlowCommand,
  ): Promise<void> {
    if (this.stopped || command.instance !== this.state.instance)
      throw new Error('Состояние устарело; обновите интерфейс');
    if (this.busy) throw new Error('Предыдущее действие ещё выполняется');
    this.busy = true;
    try {
      if (command.action === 'set-auto-forward') {
        this.state.autoForward = command.enabled;
        this.state.error = null;
        this.publish();
        return;
      }
      if (command.action === 'send') {
        const target = this.connections.target(command.target);
        if (!target) throw new Error('Получатель не подключён');
        const { entry, removed } = this.history.add({
          session: this.state.session,
          side: 'user',
          target: command.target,
          text: command.text,
          status: 'Ожидает отправки',
        });
        this.state.error = null;
        this.historyChange(entry, removed);
        this.send(entry, target, command.text);
        return;
      }
      if (command.action === 'clear') {
        this.publish([], this.history.clear(command.shown));
        return;
      }
      if (command.action === 'listen' || command.action === 'connect') {
        const settings = command.settings;
        if (
          (this.state.listener || this.state.server !== 'disconnected') &&
          settings.protocol !== this.state.settings.protocol
        )
          throw new Error('Для изменения подпротокола отключите обе стороны');
        if (command.action === 'listen') {
          if (this.state.listener) throw new Error('Приём уже запущен');
          if (!isIP(settings.host))
            throw new Error('Неверный адрес или порт приёма');
          this.state.settings.host = settings.host;
          this.state.settings.port = settings.port;
          this.state.settings.protocol = settings.protocol;
          const result = await this.connections.listen(
            structuredClone(this.state.settings),
          );
          this.state.settings.port = result.port;
          this.state.clientAddress = result.address;
          this.state.listener = true;
          ++this.state.session;
          this.event('Приём клиентов запущен');
        } else {
          if (this.state.server !== 'disconnected')
            throw new Error('Сервер уже подключается или подключён');
          const address = new URL(settings.url);
          if (
            address.protocol !== 'ws:' ||
            address.username ||
            address.password ||
            address.hash
          )
            throw new Error('Нужен адрес ws:// без учётных данных');
          this.state.settings.url = settings.url;
          this.state.settings.protocol = settings.protocol;
          this.connections.connect(structuredClone(this.state.settings));
        }
      } else if (command.action === 'disconnect-server')
        this.connections.disconnect('server');
      else if (command.action === 'disconnect-client')
        this.connections.disconnect('client');
      else if (command.action === 'stop-listener') await this.stopListener();
      else throw new Error('Неизвестная команда');
      this.state.error = null;
      this.publish();
    } finally {
      this.busy = false;
    }
  }
  private receive(
    side: Side,
    text: string,
    generation: number,
    bytes: number,
  ): void {
    try {
      this.observe?.({
        event: 'receive',
        connectionId: generation,
        text,
        bytes,
      });
    } catch {
      /* optional diagnostics */
    }
    const { entry, removed } = this.history.add({
      session: this.state.session,
      side,
      text,
      status: this.state.autoForward ? 'Ожидает пересылки' : 'Не переслано',
      ...(!this.state.autoForward ? { reason: 'Автопересылка выключена' } : {}),
    });
    this.historyChange(entry, removed);
    if (!this.state.autoForward) return;
    this.send(
      entry,
      this.connections.target(side === 'client' ? 'server' : 'client'),
      text,
      generation,
      bytes,
    );
  }
  private send(
    entry: Entry,
    target: SendTarget | undefined,
    text: string,
    generation?: number,
    bytes?: number,
  ): void {
    forward(target, text, (status, reason) => {
      if (this.stopped) return;
      const updated = this.history.update(entry.id, status, reason);
      if (updated)
        this.historyChange(updated.entry, updated.removed, 'updated');
      if (
        status === 'Передано на отправку' &&
        generation !== undefined &&
        bytes !== undefined
      ) {
        try {
          this.observe?.({
            event: 'send',
            connectionId: generation,
            text,
            bytes,
          });
        } catch {
          /* optional diagnostics */
        }
      }
    });
  }
  private async stopListener(): Promise<void> {
    await this.connections.stopListener();
    this.state.listener = false;
    this.event('Приём клиентов остановлен');
  }
  async close(): Promise<void> {
    this.stopped = true;
    await this.connections.close();
    this.subscribers.clear();
  }
}

import type {
  ControlClientMessage,
  ControlServerMessage,
} from '../../protocol.js';
import type { Entry } from '../../backend/history/history.protocol.js';
import type { SessionState } from '../../backend/application/application.protocol.js';
import type { RequestMetadata } from '../../shared/contracts.js';
import type { MessageFlowCommand } from '../../backend/message-flow/message-flow.protocol.js';
import type { Settings } from '../../backend/connection/connection.protocol.js';
export interface Transport {
  send(text: string): void;
  close(): void;
}
export class AppModel {
  state?: SessionState;
  entries = new Map<number, Entry>();
  synced = false;
  error = '';
  private transport?: Transport;
  private pending = new Map<string, ControlClientMessage['action']>();
  constructor(private readonly changed: () => void) {}
  connected(transport: Transport): void {
    this.transport = transport;
  }
  disconnected(): void {
    this.transport = undefined;
    this.synced = false;
    if (this.pending.size)
      this.error = this.pendingHas('clear')
        ? 'Результат очистки пока неизвестен'
        : 'Результат действия пока неизвестен';
    this.pending.clear();
    this.changed();
  }
  invalidate(): void {
    const transport = this.transport;
    this.disconnected();
    transport?.close();
  }
  pendingHas(action: ControlClientMessage['action']): boolean {
    return [...this.pending.values()].includes(action);
  }
  receive(packet: ControlServerMessage): void {
    if (packet.type === 'result') {
      this.pending.delete(packet.id);
      if (!packet.ok) this.error = packet.error ?? 'Ошибка действия';
      this.changed();
      return;
    }
    if (packet.type === 'error') {
      this.error = packet.message;
      this.changed();
      return;
    }
    if (packet.type === 'snapshot') this.entries.clear();
    else if (
      !this.synced ||
      this.state?.instance !== packet.state.instance ||
      packet.state.revision !== this.state.revision + 1
    ) {
      this.invalidate();
      return;
    }
    if (packet.type === 'change')
      for (const id of packet.removed) this.entries.delete(id);
    for (const entry of packet.entries) this.entries.set(entry.id, entry);
    this.state = packet.state;
    this.synced = true;
    this.changed();
  }
  command(
    action: Exclude<
      ControlClientMessage['action'],
      MessageFlowCommand['action']
    >,
    settings?: Settings,
    shown?: number[],
  ): void {
    this.dispatch(action, (metadata) => {
      if (action === 'clear')
        return shown ? { ...metadata, action, shown } : undefined;
      if (action === 'listen' || action === 'connect')
        return settings ? { ...metadata, action, settings } : undefined;
      return { ...metadata, action };
    });
  }
  sendMessage(target: 'client' | 'server', text: string): void {
    this.dispatch('send', (metadata) => ({
      ...metadata,
      action: 'send',
      target,
      text,
    }));
  }
  setAutoForward(enabled: boolean): void {
    this.dispatch('set-auto-forward', (metadata) => ({
      ...metadata,
      action: 'set-auto-forward',
      enabled,
    }));
  }
  private dispatch(
    action: ControlClientMessage['action'],
    build: (metadata: RequestMetadata) => ControlClientMessage | undefined,
  ): void {
    if (
      !this.synced ||
      !this.transport ||
      !this.state ||
      this.pendingHas(action)
    )
      return;
    // LAN HTTP is not a secure context: randomUUID may be unavailable there.
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const metadata = { id, instance: this.state.instance };
    const command = build(metadata);
    if (!command) return;
    this.pending.set(command.id, action);
    this.error = '';
    try {
      this.transport.send(JSON.stringify(command));
    } catch {
      this.disconnected();
    }
    this.changed();
  }
}

import {
  CONNECT_TIMEOUT_MS,
  MAX_PAYLOAD_BYTES,
  REPLY_TIMEOUT_MS,
} from './limits.js';

export interface ConnectionEvents {
  opened(): void;
  received(data: unknown): void;
  failed(): void;
  closed(): void;
}

export interface Connection {
  send(text: string): void;
  close(): void;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface EchoState {
  connection: 'disconnected' | 'connecting' | 'ready';
  connectionError: string | null;
  input: string;
  reply: string | null;
  result: 'idle' | 'waiting' | 'received' | 'mismatch' | 'error';
  resultError: string | null;
  previousReply: boolean;
  validationError: string | null;
}

export interface ControllerOptions {
  createConnection(events: ConnectionEvents): Connection;
  onChange(state: Readonly<EchoState>): void;
  clock?: Clock;
}

const browserClock: Clock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer) =>
    globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
};

const SIZE_ERROR = 'Текст превышает 64 КиБ. Сократите его для отправки';

/** Shared UI state machine. Connections and time are injected for deterministic checks. */
export class EchoController {
  private current: EchoState = {
    connection: 'disconnected',
    connectionError: null,
    input: '',
    reply: null,
    result: 'idle',
    resultError: null,
    previousReply: false,
    validationError: null,
  };
  private readonly clock: Clock;
  private transport: Connection | null = null;
  private generation = 0;
  private disposed = false;
  private connectTimer: unknown = undefined;
  private replyTimer: unknown = undefined;
  private attempt: { text: string; sentAt: number | null } | null = null;

  constructor(private readonly options: ControllerOptions) {
    this.clock = options.clock ?? browserClock;
  }

  get state(): Readonly<EchoState> {
    return { ...this.current };
  }

  start(): void {
    this.reconnect();
  }

  reconnect(): void {
    if (this.disposed || this.current.connection !== 'disconnected') return;
    const generation = ++this.generation;
    const startedAt = this.clock.now();
    this.current.connection = 'connecting';
    this.current.connectionError = null;
    this.publish();
    const isCurrent = () => !this.disposed && generation === this.generation;

    const checkDeadline = () => {
      if (!isCurrent() || this.current.connection !== 'connecting') return;
      const remaining = CONNECT_TIMEOUT_MS - (this.clock.now() - startedAt);
      if (remaining <= 0) this.disconnect('Истекло время подключения');
      else this.connectTimer = this.clock.setTimeout(checkDeadline, remaining);
    };

    try {
      const transport = this.options.createConnection({
        opened: () => {
          if (!isCurrent() || this.current.connection !== 'connecting') return;
          if (this.clock.now() - startedAt >= CONNECT_TIMEOUT_MS) {
            this.disconnect('Истекло время подключения');
            return;
          }
          this.clearConnectTimer();
          this.current.connection = 'ready';
          this.current.connectionError = null;
          this.publish();
        },
        received: (data) => {
          if (isCurrent()) this.receive(data);
        },
        failed: () => {
          if (isCurrent()) this.disconnect('Ошибка соединения');
        },
        closed: () => {
          if (isCurrent()) this.disconnect('Соединение закрыто');
        },
      });
      if (isCurrent()) {
        this.transport = transport;
        checkDeadline();
      } else {
        // A synchronous test transport can fail during its construction.
        try {
          transport.close();
        } catch {
          /* The old connection is already inactive. */
        }
      }
    } catch {
      if (isCurrent()) this.disconnect('Не удалось подключиться');
    }
  }

  setInput(text: string): void {
    if (
      this.disposed ||
      this.current.result === 'waiting' ||
      text === this.current.input
    )
      return;
    this.current.input = text;
    if (this.current.reply !== null) this.current.previousReply = true;
    if (this.current.validationError !== null) {
      this.current.validationError = this.isTooLarge(text) ? SIZE_ERROR : null;
    }
    this.publish();
  }

  send(): void {
    if (
      this.disposed ||
      this.current.connection !== 'ready' ||
      !this.transport ||
      this.attempt
    )
      return;
    if (this.isTooLarge(this.current.input)) {
      this.current.validationError = SIZE_ERROR;
      this.publish();
      return;
    }

    const attempt = { text: this.current.input, sentAt: null as number | null };
    this.attempt = attempt;
    this.current.reply = null;
    this.current.previousReply = false;
    this.current.result = 'waiting';
    this.current.resultError = null;
    this.current.validationError = null;
    this.publish();
    try {
      this.transport.send(attempt.text);
    } catch {
      this.disconnect('Не удалось отправить текст');
      return;
    }
    if (this.attempt !== attempt) return;
    attempt.sentAt = this.clock.now();
    const checkDeadline = () => {
      if (this.disposed || this.attempt !== attempt || attempt.sentAt === null)
        return;
      const remaining = REPLY_TIMEOUT_MS - (this.clock.now() - attempt.sentAt);
      if (remaining <= 0) this.disconnect('Истекло время ожидания ответа');
      else this.replyTimer = this.clock.setTimeout(checkDeadline, remaining);
    };
    checkDeadline();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseConnection();
  }

  private receive(data: unknown): void {
    const attempt = this.attempt;
    if (!attempt || this.current.connection !== 'ready') return;
    if (
      attempt.sentAt !== null &&
      this.clock.now() - attempt.sentAt >= REPLY_TIMEOUT_MS
    ) {
      this.disconnect('Истекло время ожидания ответа');
      return;
    }
    if (typeof data !== 'string') {
      this.disconnect('Получен неподдерживаемый формат ответа');
      return;
    }
    this.clearReplyTimer();
    this.attempt = null;
    this.current.reply = data;
    this.current.result = data === attempt.text ? 'received' : 'mismatch';
    this.current.resultError = null;
    this.current.previousReply = false;
    this.publish();
  }

  private disconnect(reason: string): void {
    this.releaseConnection();
    this.current.connection = 'disconnected';
    this.current.connectionError = reason;
    if (this.current.reply !== null) {
      this.current.previousReply = true;
    } else {
      this.current.result = 'error';
      this.current.resultError = reason;
    }
    this.publish();
  }

  private releaseConnection(): void {
    // Invalidate callbacks before close(), which may itself emit an event.
    ++this.generation;
    this.clearConnectTimer();
    this.clearReplyTimer();
    this.attempt = null;
    const transport = this.transport;
    this.transport = null;
    try {
      transport?.close();
    } catch {
      /* Recovery is available even if close fails. */
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== undefined)
      this.clock.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
  }

  private clearReplyTimer(): void {
    if (this.replyTimer !== undefined) this.clock.clearTimeout(this.replyTimer);
    this.replyTimer = undefined;
  }

  private isTooLarge(text: string): boolean {
    return new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES;
  }

  private publish(): void {
    this.options.onChange(this.state);
  }
}

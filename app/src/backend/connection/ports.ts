import type { Phase, Settings, Side } from './connection.protocol.js';
export interface SendTarget {
  send(text: string, complete: (error?: Error) => void): void;
}
export interface ConnectionEvents {
  phase(side: Side, phase: Phase, reason: string): void;
  text(side: Side, text: string, generation: number, bytes: number): void;
  event(reason: string): void;
  error(reason: string): void;
  binary(): void;
}
export interface ConnectionPort {
  events?: ConnectionEvents;
  listen(settings: Settings): Promise<{ port: number; address: string }>;
  connect(settings: Settings): void;
  target(side: Side): SendTarget | undefined;
  disconnect(side: Side): void;
  stopListener(): Promise<void>;
  close(): Promise<void>;
}

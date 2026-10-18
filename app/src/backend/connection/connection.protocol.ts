import type { RequestMetadata } from '../../shared/contracts.js';
import { isRecord } from '../../shared/contracts.js';
export type Side = 'client' | 'server';
export type Phase = 'disconnected' | 'connecting' | 'connected';
export interface Settings {
  url: string;
  host: string;
  port: number;
  protocol: string;
}
export type ConnectionCommand = RequestMetadata &
  (
    | { action: 'listen' | 'connect'; settings: Settings }
    | { action: 'stop-listener' | 'disconnect-client' | 'disconnect-server' }
  );
export function isPhase(value: unknown): value is Phase {
  return (
    value === 'disconnected' || value === 'connecting' || value === 'connected'
  );
}
export function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.host === 'string' &&
    Number.isInteger(value.port) &&
    Number(value.port) >= 0 &&
    Number(value.port) <= 65535 &&
    typeof value.protocol === 'string' &&
    (!value.protocol || /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value.protocol))
  );
}
/** Metadata is checked once by the control boundary. */
export function isConnectionPayload(value: Record<string, unknown>): boolean {
  switch (value.action) {
    case 'listen':
    case 'connect':
      return isSettings(value.settings);
    case 'stop-listener':
    case 'disconnect-client':
    case 'disconnect-server':
      return true;
    default:
      return false;
  }
}

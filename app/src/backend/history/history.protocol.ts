import type { RequestMetadata } from '../../shared/contracts.js';
import type { Side } from '../connection/connection.protocol.js';
import { isRecord, isCounter } from '../../shared/contracts.js';
export interface Entry {
  id: number;
  session: number;
  time: string;
  side: Side | 'event' | 'user';
  target?: Side;
  text: string;
  status: string;
  reason?: string;
}
export type EntryChange = Entry & { change: 'added' | 'updated' };
export type ClearHistoryCommand = RequestMetadata & {
  action: 'clear';
  shown: number[];
};
export function isShown(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id) => Number.isSafeInteger(id));
}
export function isEntry(value: unknown): value is Entry {
  return (
    isRecord(value) &&
    isCounter(value.id) &&
    value.id > 0 &&
    isCounter(value.session) &&
    typeof value.time === 'string' &&
    (value.side === 'client' ||
      value.side === 'server' ||
      value.side === 'event' ||
      value.side === 'user') &&
    (value.side === 'user'
      ? value.target === 'client' || value.target === 'server'
      : value.target === undefined) &&
    typeof value.text === 'string' &&
    typeof value.status === 'string' &&
    (value.reason === undefined || typeof value.reason === 'string')
  );
}
export function isEntryChange(value: unknown): value is EntryChange {
  return (
    isEntry(value) &&
    'change' in value &&
    (value.change === 'added' || value.change === 'updated')
  );
}

import type { Settings, Phase } from '../connection/connection.protocol.js';
import type { Entry, EntryChange } from '../history/history.protocol.js';
import { isSettings, isPhase } from '../connection/connection.protocol.js';
import { isEntry, isEntryChange } from '../history/history.protocol.js';
import { isRecord, isCounter, isRequestId } from '../../shared/contracts.js';
export interface SessionState {
  instance: string;
  revision: number;
  session: number;
  listener: boolean;
  autoForward: boolean;
  client: Phase;
  server: Phase;
  settings: Settings;
  clientAddress: string;
  error: string | null;
  historyNotice?: string;
}
export type SessionUpdate =
  | { type: 'snapshot'; state: SessionState; entries: Entry[] }
  | {
      type: 'change';
      state: SessionState;
      entries: EntryChange[];
      removed: number[];
    };
export function isSessionState(value: unknown): value is SessionState {
  return (
    isRecord(value) &&
    isRequestId(value.instance) &&
    isCounter(value.revision) &&
    isCounter(value.session) &&
    typeof value.listener === 'boolean' &&
    typeof value.autoForward === 'boolean' &&
    isPhase(value.client) &&
    isPhase(value.server) &&
    isSettings(value.settings) &&
    typeof value.clientAddress === 'string' &&
    (value.error === null || typeof value.error === 'string') &&
    (value.historyNotice === undefined ||
      typeof value.historyNotice === 'string')
  );
}
export function isSessionUpdate(value: unknown): value is SessionUpdate {
  if (
    !isRecord(value) ||
    !isSessionState(value.state) ||
    !Array.isArray(value.entries)
  )
    return false;
  if (value.type === 'snapshot') return value.entries.every(isEntry);
  return (
    value.type === 'change' &&
    value.entries.every(isEntryChange) &&
    Array.isArray(value.removed) &&
    value.removed.every((id) => isCounter(id) && id > 0)
  );
}

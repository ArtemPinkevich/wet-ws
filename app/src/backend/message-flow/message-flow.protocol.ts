import type { RequestMetadata } from '../../shared/contracts.js';
import type { Side } from '../connection/connection.protocol.js';
import { isRecord } from '../../shared/contracts.js';

export type MessageFlowCommand = RequestMetadata &
  (
    | { action: 'set-auto-forward'; enabled: boolean }
    | { action: 'send'; target: Side; text: string }
  );

export function isMessageFlowPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((value.action === 'set-auto-forward' &&
      typeof value.enabled === 'boolean') ||
      (value.action === 'send' &&
        (value.target === 'client' || value.target === 'server') &&
        typeof value.text === 'string'))
  );
}

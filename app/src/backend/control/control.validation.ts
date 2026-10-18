import type { ControlClientMessage } from '../../protocol.js';
import { isRecord, isRequestId } from '../../shared/contracts.js';
import { isConnectionPayload } from '../connection/connection.protocol.js';
import { isShown } from '../history/history.protocol.js';
import { isMessageFlowPayload } from '../message-flow/message-flow.protocol.js';
/** A readable, checked ID is sufficient to correlate a rejected command request. */
export function commandRequestId(value: unknown): string | undefined {
  return isRecord(value) && isRequestId(value.id) && 'action' in value
    ? value.id
    : undefined;
}
export function isControlClientMessage(
  value: unknown,
): value is ControlClientMessage {
  return (
    isRecord(value) &&
    isRequestId(value.id) &&
    isRequestId(value.instance) &&
    (isConnectionPayload(value) ||
      isMessageFlowPayload(value) ||
      (value.action === 'clear' && isShown(value.shown)))
  );
}

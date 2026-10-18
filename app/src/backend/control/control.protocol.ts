import { isRecord, isRequestId } from '../../shared/contracts.js';
export type ControlResult =
  | { type: 'result'; id: string; ok: true }
  | { type: 'result'; id: string; ok: false; error: string };
export interface ControlError {
  type: 'error';
  message: string;
}
export function isControlReply(
  value: unknown,
): value is ControlResult | ControlError {
  if (!isRecord(value)) return false;
  if (value.type === 'error') return typeof value.message === 'string';
  return (
    value.type === 'result' &&
    isRequestId(value.id) &&
    (value.ok === true ||
      (value.ok === false && typeof value.error === 'string'))
  );
}

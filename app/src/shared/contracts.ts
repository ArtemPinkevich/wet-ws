/** Correlation metadata shared by independent control command owners. */
export interface RequestMetadata {
  id: string;
  instance: string;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
export function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

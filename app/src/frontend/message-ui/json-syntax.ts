export type JsonSyntax =
  | { kind: 'neutral' | 'valid' }
  | {
      kind: 'invalid';
      message: string;
      line: number | null;
      column: number | null;
    };

/** A browser may report no location. Never guess one from the invalid payload. */
export function jsonErrorPosition(
  text: string,
  message: string,
): { line: number; column: number } | null {
  const lines = text.split(/\r\n?|\n/);
  // Chromium appends this diagnostic suffix. Earlier text may quote the payload,
  // including strings such as "position 3" or "line 2 column 1".
  const position = / at position (\d+)(?: \(line \d+ column \d+\))?$/.exec(
    message,
  );
  if (!position) return null;
  const offset = Number(position[1]);
  if (!Number.isSafeInteger(offset) || offset > text.length) return null;
  const prefix = text.slice(0, offset).split(/\r\n?|\n/);
  const line = prefix.length;
  const column = prefix.at(-1)!.length + 1;
  if (
    !Number.isSafeInteger(line) ||
    !Number.isSafeInteger(column) ||
    line < 1 ||
    line > lines.length ||
    column < 1 ||
    column > lines[line - 1]!.length + 1
  )
    return null;
  return { line, column };
}

export function checkJsonSyntax(text: string): JsonSyntax {
  if (!text.trim()) return { kind: 'neutral' };
  try {
    JSON.parse(text);
    return { kind: 'valid' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = jsonErrorPosition(text, message);
    return {
      kind: 'invalid',
      message,
      line: position?.line ?? null,
      column: position?.column ?? null,
    };
  }
}

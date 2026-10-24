export const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function escapeText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
}

const paths: Record<string, string> = {
  send: 'm4 4 17 8-17 8 3-8-3-8Zm3 8h14',
  inspect: 'M9 3v18M5 3h14v18H5zM14 9l3 3-3 3',
  expand: 'M12 8V3m-3 3 3-3 3 3M12 16v5m-3-3 3 3 3-3M4 12h16',
  fold: 'M12 3v5m-3-3 3 3 3-3M12 21v-5m-3 3 3-3 3 3M4 12h16',
};
export function icon(name: string): string {
  return `<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths['send']}"/></svg>`;
}
export function highlight(text: string): string {
  // Decorative syntax colors only. Every source fragment is HTML-escaped.
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g;
  let output = '',
    at = 0;
  for (const match of text.matchAll(re)) {
    output += escapeText(text.slice(at, match.index));
    const kind = match[2]
      ? 'key'
      : match[1]
        ? 'string'
        : match[3]
          ? 'literal'
          : 'number';
    output += `<span class="json-${kind}">${escapeText(match[1] || match[3] || match[4] || '')}</span>${escapeText(match[2] || '')}`;
    at = match.index + match[0].length;
  }
  return output + escapeText(text.slice(at));
}
export function notify(message: string): void {
  el('feedback').textContent = message;
}

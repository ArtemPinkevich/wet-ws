import type { SendTarget } from '../connection/ports.js';

/** Ordinary ws sending only. Flow-control policies are deferred as TB-001. */
export function forward(
  target: SendTarget | undefined,
  text: string,
  complete: (status: string, reason?: string) => void,
): void {
  if (!target) {
    complete('Не переслано', 'Получатель не подключён');
    return;
  }
  try {
    target.send(text, (error) =>
      complete(
        error ? 'Результат неизвестен' : 'Передано на отправку',
        error?.message,
      ),
    );
  } catch (error) {
    complete(
      'Не переслано',
      error instanceof Error ? error.message : 'Ошибка отправки',
    );
  }
}

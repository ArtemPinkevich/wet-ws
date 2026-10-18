import { startService } from './service.js';

const requestedPort = process.env.PORT ?? '8080';
if (!/^\d+$/.test(requestedPort)) {
  console.error('PORT must be an integer from 0 to 65535.');
  process.exitCode = 1;
} else {
  try {
    const service = await startService({
      host: process.env.HOST ?? '0.0.0.0',
      port: Number(requestedPort),
      ...(process.env.WS_DIAGNOSTICS === '1'
        ? {
            diagnostics: (event: unknown) => console.log(JSON.stringify(event)),
          }
        : {}),
    });
    console.log(JSON.stringify({ event: 'ready', url: service.url }));
    let stopping = false;
    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      void service.close().catch((error: unknown) => {
        console.error(
          'Unable to stop service:',
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch (error: unknown) {
    console.error(
      'Unable to start service:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

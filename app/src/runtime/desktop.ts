import { app, BrowserWindow, dialog, session } from 'electron';
import { appendFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { startService } from './service.js';

const inspect = process.argv.includes('--inspect-ui');
const diagnosticFile = process.env.WET_WS_DIAGNOSTICS_FILE;
const diagnostic = inspect || Boolean(diagnosticFile);
let service: Awaited<ReturnType<typeof startService>> | undefined;
let quitting = false;

function record(value: unknown): void {
  const line = JSON.stringify(value) + '\n';
  if (diagnosticFile) appendFileSync(diagnosticFile, line, 'utf8');
  else if (diagnostic) process.stdout.write(line);
}

app.on('before-quit', (event) => {
  if (quitting || !service) return;
  event.preventDefault();
  quitting = true;
  void service.close().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());

// Electron waits for ESM evaluation before emitting ready; do not top-level-await it.
void app
  .whenReady()
  .then(async () => {
    service = await startService({
      host: '0.0.0.0',
      port: 0,
      ...(diagnostic ? { diagnostics: record } : {}),
    });
    const uiAddress = new URL(service.url);
    const lanAddress = Object.values(networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)?.address;
    if (lanAddress) uiAddress.hostname = lanAddress;
    const origin = uiAddress.origin;
    // The desktop has no external content. This also prevents accidental CDN dependencies.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const local =
        (url.protocol === 'http:' || url.protocol === 'ws:') &&
        url.host === new URL(origin).host;
      const devtools = url.protocol === 'devtools:';
      if (!local && !devtools)
        record({ event: 'blocked-request', url: details.url });
      callback({ cancel: !local && !devtools });
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    const window = new BrowserWindow({
      width: 980,
      height: 820,
      minWidth: 360,
      minHeight: 520,
      title: 'WET-WS',
      backgroundColor: '#f2f5f8',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    await window.loadURL(uiAddress.href);
    window.show();
    if (inspect) window.webContents.openDevTools({ mode: 'detach' });
    if (diagnostic)
      record({ event: 'ready', url: service.url, versions: process.versions });
  })
  .catch(async (error: unknown) => {
    dialog.showErrorBox(
      'Не удалось запустить wet-ws',
      error instanceof Error ? error.message : String(error),
    );
    await service?.close();
    app.exit(1);
  });

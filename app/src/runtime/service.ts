import { readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import type { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { networkInterfaces, hostname } from 'node:os';
import { Connection } from '../backend/connection/connection.js';
import { Application } from '../backend/application/application.js';
import { bindControl } from '../backend/control/control.js';

export interface DiagnosticEvent {
  event: 'receive' | 'send';
  connectionId: number;
  text: string;
  bytes: number;
}

export interface ServiceOptions {
  host: string;
  port: number;
  assetsDir?: string;
  diagnostics?: (event: DiagnosticEvent) => void;
}

export interface RunningService {
  url: string;
  port: number;
  close(): Promise<void>;
}

/** Shared by the standalone server and the Electron main process (SYS-01/02). */
export async function startService(
  options: ServiceOptions,
): Promise<RunningService> {
  if (options.host !== '127.0.0.1' && options.host !== '0.0.0.0') {
    throw new Error(
      'HOST must be 127.0.0.1 or 0.0.0.0 for this local delivery.',
    );
  }
  if (
    !Number.isInteger(options.port) ||
    options.port < 0 ||
    options.port > 65535
  ) {
    throw new Error('PORT must be an integer from 0 to 65535.');
  }

  const assetsDir =
    options.assetsDir ??
    fileURLToPath(new URL('../frontend/', import.meta.url));
  const asset = (name: string, type = 'text/javascript; charset=utf-8') => ({
    path: join(assetsDir, name),
    type,
  });
  const assets = new Map([
    ['/', asset('app-shell/index.html', 'text/html; charset=utf-8')],
    ['/frontend/app-shell/app.js', asset('app-shell/app.js')],
    [
      '/frontend/app-shell/styles.css',
      asset('app-shell/styles.css', 'text/css; charset=utf-8'),
    ],
    ['/frontend/app-model/model.js', asset('app-model/model.js')],
    [
      '/frontend/connection-ui/connection-ui.js',
      asset('connection-ui/connection-ui.js'),
    ],
    ['/frontend/chat-ui/chat-ui.js', asset('chat-ui/chat-ui.js')],
    ['/frontend/message-ui/message-ui.js', asset('message-ui/message-ui.js')],
    ['/frontend/ui.js', asset('ui.js')],
    ['/frontend/library-ui/templates.js', asset('library-ui/templates.js')],
    ['/frontend/library-ui/library-ui.js', asset('library-ui/library-ui.js')],
    ['/frontend/library-ui/drag.js', asset('library-ui/drag.js')],
    ['/frontend/workbench-ui/layout.js', asset('workbench-ui/layout.js')],
    [
      '/frontend/control-client/control-client.js',
      asset('control-client/control-client.js'),
    ],
    ['/ui/app.js', asset('app-shell/app.js')],
    ['/ui/control-client.js', asset('control-client/control-client.js')],
    ['/ui/model.js', asset('app-model/model.js')],
    [
      '/ui/styles.css',
      asset('app-shell/styles.css', 'text/css; charset=utf-8'),
    ],
    [
      '/shared/contracts.js',
      {
        path: fileURLToPath(new URL('../shared/contracts.js', import.meta.url)),
        type: 'text/javascript; charset=utf-8',
      },
    ],
    ...['application', 'connection', 'history', 'control', 'message-flow'].map(
      (feature) =>
        [
          '/backend/' + feature + '/' + feature + '.protocol.js',
          {
            path: fileURLToPath(
              new URL(
                '../backend/' + feature + '/' + feature + '.protocol.js',
                import.meta.url,
              ),
            ),
            type: 'text/javascript; charset=utf-8',
          },
        ] as const,
    ),
  ]);
  let authority = '';
  let closing = false;
  const sockets = new Set<Socket>();
  const localHosts = new Set([
    '127.0.0.1',
    'localhost',
    hostname().toLowerCase(),
    ...Object.values(networkInterfaces()).flatMap((items) =>
      (items ?? []).map((item) => item.address),
    ),
  ]);
  const validHost = (request: IncomingMessage): boolean => {
    try {
      const address = new URL(`http://${request.headers.host}`);
      return (
        localHosts.has(address.hostname.toLowerCase()) &&
        Number(address.port || 80) === Number(authority.split(':').at(-1))
      );
    } catch {
      return false;
    }
  };

  const securityHeaders = (response: ServerResponse): void => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
  };
  const reply = (
    response: ServerResponse,
    status: number,
    message: string,
  ): void => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(message);
  };

  const server = createServer((request, response) => {
    securityHeaders(response);
    if (closing) {
      reply(response, 503, 'Service is stopping.');
      return;
    }
    if (!validHost(request)) {
      reply(response, 403, 'Unexpected Host.');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      reply(response, 405, 'Method not allowed.');
      return;
    }
    // Exact paths deliberately exclude traversal, source files and directory browsing.
    const asset = assets.get(request.url ?? '');
    if (!asset) {
      reply(response, 404, 'Not found.');
      return;
    }
    void readFile(asset.path)
      .then((body) => {
        if (response.destroyed) return;
        response.writeHead(200, {
          'Content-Type': asset.type,
          'Content-Length': body.byteLength,
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (!response.destroyed)
          reply(
            response,
            error.code === 'ENOENT' ? 404 : 500,
            'Unable to load resource.',
          );
      });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  const application = new Application(new Connection(), options.diagnostics);
  const websocketServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 0,
  });
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    if (
      closing ||
      !validHost(request) ||
      request.url !== '/control' ||
      request.headers.origin !== `http://${request.headers.host}`
    ) {
      socket.end(
        'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (client) => {
      bindControl(client, application);
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(options.port, options.host, () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No TCP listening address.');
  const port = address.port;
  authority = `127.0.0.1:${port}`;
  const url = `http://${authority}`;

  let closePromise: Promise<void> | undefined;
  return {
    url,
    port,
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = application.close().then(
        () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            // Include idle HTTP, partially received requests and upgraded connections.
            for (const websocket of websocketServer.clients)
              websocket.terminate();
            websocketServer.close();
            for (const socket of sockets) socket.destroy();
          }),
      );
      return closePromise;
    },
  };
}

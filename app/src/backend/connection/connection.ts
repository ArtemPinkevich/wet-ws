import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import type { Settings, Side, Phase } from './connection.protocol.js';
import type { ConnectionPort, ConnectionEvents, SendTarget } from './ports.js';

/** External transports. No history, UI or application commands here. */
export class Connection implements ConnectionPort {
  private listener?: Server;
  private acceptor?: WebSocketServer;
  private sockets = new Set<Socket>();
  private peers: Partial<Record<Side, WebSocket>> = {};
  private generation = { client: 0, server: 0 };
  private stopped = false;
  events?: ConnectionEvents;
  private phase(side: Side, phase: Phase, reason: string): void {
    this.events?.phase(side, phase, reason);
  }
  target(side: Side): SendTarget | undefined {
    const socket = this.peers[side];
    if (!socket || socket.readyState !== WebSocket.OPEN) return undefined;
    return {
      send: (text, complete) => socket.send(text, { binary: false }, complete),
    };
  }
  async listen(settings: Settings): Promise<{ port: number; address: string }> {
    const listener = createServer((_request, response) => {
      response.writeHead(426);
      response.end('WebSocket required');
    });
    this.listener = listener;
    listener.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    const acceptor = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      maxPayload: 0,
      handleProtocols: (offers) =>
        settings.protocol && offers.has(settings.protocol)
          ? settings.protocol
          : false,
    });
    this.acceptor = acceptor;
    listener.on('upgrade', (request, socket, head) => {
      socket.on('error', () => socket.destroy());
      const offers = String(request.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((value) => value.trim());
      if (
        this.stopped ||
        this.peers.client ||
        (settings.protocol && !offers.includes(settings.protocol))
      ) {
        this.events?.event(
          this.peers.client
            ? 'Подключение отклонено: клиент уже подключён'
            : 'Подключение отклонено: подпротокол не совпадает',
        );
        socket.end(
          'HTTP/1.1 409 Conflict\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
        );
        return;
      }
      acceptor.handleUpgrade(request, socket, head, (client) => {
        this.peers.client = client;
        this.attach('client', client);
        this.phase('client', 'connected', 'Клиент подключён');
      });
    });
    listener.on('error', (error) => this.events?.error(error.message));
    try {
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(settings.port, settings.host, () => {
          listener.off('error', reject);
          resolve();
        });
      });
      if (this.stopped || this.listener !== listener)
        throw new Error('Запуск приёма отменён');
      const port = (listener.address() as { port: number }).port;
      const host =
        settings.host === '0.0.0.0'
          ? (Object.values(networkInterfaces())
              .flatMap((items) => items ?? [])
              .find((item) => item.family === 'IPv4' && !item.internal)
              ?.address ?? '127.0.0.1')
          : settings.host;
      return {
        port,
        address: `ws://${host.includes(':') ? `[${host}]` : host}:${port}`,
      };
    } catch (error) {
      if (this.listener === listener) {
        this.listener = undefined;
        this.acceptor = undefined;
      }
      acceptor.close();
      listener.close();
      throw error;
    }
  }
  connect(settings: Settings): void {
    const socket = new WebSocket(
      settings.url,
      settings.protocol ? [settings.protocol] : [],
      {
        perMessageDeflate: false,
        handshakeTimeout: 5000,
        followRedirects: false,
        maxPayload: 0,
      },
    );
    this.peers.server = socket;
    this.attach('server', socket);
    this.phase('server', 'connecting', 'Подключение к серверу');
    socket.once('open', () => {
      if (this.stopped || this.peers.server !== socket) return;
      if (socket.protocol !== settings.protocol) {
        this.events?.error('Сервер не согласовал подпротокол');
        this.disconnect('server');
        return;
      }
      this.phase('server', 'connected', 'Сервер подключён');
    });
  }
  private attach(side: Side, socket: WebSocket): void {
    const generation = ++this.generation[side];
    const current = () => !this.stopped && this.generation[side] === generation;
    socket.on('error', (error) => {
      if (current()) this.events?.error(error.message);
    });
    socket.on('close', (code, reason) => {
      if (!current()) return;
      this.peers[side] = undefined;
      this.phase(
        side,
        'disconnected',
        `${side === 'client' ? 'Клиент' : 'Сервер'} отключён (${code}${reason.length ? `: ${reason.toString()}` : ''})`,
      );
    });
    socket.on('message', (data, binary) => {
      if (!current()) return;
      if (binary) {
        this.events?.binary();
        return;
      }
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      this.events?.text(
        side,
        buffer.toString('utf8'),
        generation,
        buffer.length,
      );
    });
  }
  disconnect(side: Side): void {
    ++this.generation[side];
    const socket = this.peers[side];
    this.peers[side] = undefined;
    socket?.terminate();
    this.phase(
      side,
      'disconnected',
      `${side === 'client' ? 'Клиент' : 'Сервер'} отключён пользователем`,
    );
  }
  async stopListener(): Promise<void> {
    this.disconnect('client');
    const listener = this.listener;
    this.listener = undefined;
    this.acceptor?.close();
    this.acceptor = undefined;
    for (const socket of this.sockets) socket.destroy();
    if (listener)
      await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
  async close(): Promise<void> {
    this.stopped = true;
    this.disconnect('server');
    await this.stopListener();
  }
}

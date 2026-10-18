import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
const serverPort = Number(process.env.ECHO_PORT ?? 9000),
  pagePort = Number(process.env.CLIENT_PORT ?? 9001);
const echo = new WebSocketServer({ host: '0.0.0.0', port: serverPort });
echo.on('connection', (socket) =>
  socket.on('message', (data, binary) => socket.send(data, { binary })),
);
const page = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>WET-WS — проверочный клиент</title><h1>Проверочный клиент</h1><label>Адрес трансивера <input id="address" value="ws://127.0.0.1:8081"></label><label>Подпротокол <input id="protocol"></label><button id="connect">Подключить</button><p id="state">Не подключён</p><label>Сообщение <textarea id="text"></textarea></label><button id="send" disabled>Отправить</button><pre id="log"></pre><script>let socket;const e=id=>document.getElementById(id);e('connect').onclick=()=>{socket?.close();const protocol=e('protocol').value.trim();socket=new WebSocket(e('address').value,protocol?[protocol]:[]);socket.onopen=()=>{e('state').textContent='Подключён';e('send').disabled=false;};socket.onclose=()=>{e('state').textContent='Отключён';e('send').disabled=true;};socket.onerror=()=>e('state').textContent='Ошибка соединения';socket.onmessage=event=>e('log').textContent+='Ответ: '+event.data+'\\n';};e('send').onclick=()=>{const text=e('text').value;socket.send(text);e('log').textContent+='Отправлено: '+text+'\\n';};</script></html>`;
const http = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(page);
});
http.listen(pagePort, '0.0.0.0', () =>
  console.log(
    `Клиент: http://127.0.0.1:${pagePort}; echo-сервер: ws://127.0.0.1:${serverPort}`,
  ),
);
echo.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  http.close();
});
const stop = () => {
  for (const socket of echo.clients) socket.terminate();
  echo.close();
  http.close();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

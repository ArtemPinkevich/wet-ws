import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";

const port = process.env.PORT || 3002;

const app = express();
app.use(cors());

const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Новый клиент подключился!");

  const sendMessageOtherClient = (message, sender) => {
    clients.forEach((client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  };

  ws.on("message", (message) => {
    console.log("Получено сообщение: ", message.toString());
    sendMessageOtherClient(message, ws);
  });

  ws.on("close", () => {
    console.log("Клиент отключился!");
    clients.delete(ws);
  });
});

server.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

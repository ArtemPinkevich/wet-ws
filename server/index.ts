import express from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import { wsDataRoute } from "./router/index";

const port = process.env.PORT || 3002;

const app = express();
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use(cors());

app.use("/api", wsDataRoute);

const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const clients = new Set<any>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Новый клиент подключился!");

  const sendMessageOtherClient = (message: any, sender: any) => {
    clients.forEach((client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  };

  ws.on("message", (message: any) => {
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

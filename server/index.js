import express from "express";
import http from "http";
import cors from "cors";

const port = process.env.PORT || 3002;

const app = express();
app.use(cors());

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

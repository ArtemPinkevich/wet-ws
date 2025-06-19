const URL = "ws://localhost:3002";

const openConnectSocket = () => {
  const socket = new WebSocket(URL);

  socket.onopen = (event) => {
    console.log("Соединение открыто:", event);
  };

  socket.onmessage = (event) => {
    console.log("Сообщение: ", event.data);
  };

  socket.onerror = (error) => {
    console.error("Ошибка:", error);
  };

  socket.onclose = (event) => {
    console.log("Соединение закрыто:", event);
  };

  return socket;
};

const sendMessageText = (socket: WebSocket, message: string) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message);
  }
};

const closeConnectSocket = (socket: WebSocket) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send("Клиент отключился!");
    socket.close();
  }
};

export { openConnectSocket, sendMessageText, closeConnectSocket };

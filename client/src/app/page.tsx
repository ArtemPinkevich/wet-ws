"use client";

import { ChangeEvent, useState } from "react";
import {
  closeConnectSocket,
  openConnectSocket,
  sendMessageText,
} from "./socketHelper";

export default function Home() {
  const [messages, setMessage] = useState<string[]>([]);
  const [text, setText] = useState<string>("");
  const [socket, setSocket] = useState<WebSocket | null>(null);

  const handleChangeText = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value != "") {
      setText(event.target.value);
    }
  };

  const handleSendText = () => {
    if (socket && text.length != 0) {
      sendMessageText(socket, text);
      setMessage([...messages, text]);
      setText("");
    }
  };

  const connect = () => {
    if (!socket) {
      setSocket(openConnectSocket());
    }
  };

  const disconnect = () => {
    if (socket) {
      closeConnectSocket(socket);
      setSocket(null);
    }
  };

  if (socket) {
    socket.onmessage = (mes) => {
      const data = mes.data;
      setMessage((mes) => [...mes, data]);
    };
  }

  return (
    <div style={{ display: "flex", gap: "5rem" }}>
      <div>
        <input
          type="text"
          value={text}
          style={{
            width: "100px",
            height: "50px",
          }}
          onChange={(e) => handleChangeText(e)}
        />
        <button onClick={handleSendText}>Send text</button>

        <button
          onClick={connect}
          style={{
            width: "max-content",
            height: "30px",
            backgroundColor: "green",
          }}
        >
          Connect
        </button>
        <button
          onClick={disconnect}
          style={{
            width: "max-content",
            height: "30px",
            backgroundColor: "red",
          }}
        >
          Disconnect
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <h2>MESSAGE:</h2>
        {messages.map((message, index) => (
          <span key={index}>{message}</span>
        ))}
      </div>
    </div>
  );
}

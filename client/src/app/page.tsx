"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { SocketSevice } from "./services/socket.service";
import postListenerData from "./api/listenerData.api";

export default function Home() {
  const [messages, setMessage] = useState<string[]>([]);
  const [text, setText] = useState<string>("");
  const [clientPort, setClientPort] = useState<number>();
  const [serverPort, setServerPort] = useState<number>();

  const [socketService] = useState(() => new SocketSevice());

  const handlePostListenerData = async () => {
    if (clientPort && serverPort)
      await postListenerData({
        clientPort,
        serverPort,
      });
  };

  const getNewMessage = (message: string) => {
    setMessage((prev) => [...prev, message]);
  };

  const handleConnectSocket = () => {
    socketService.connect();
  };

  const handleDisconnectSocket = () => {
    socketService.disconnect();
  };

  const handleChangeClientPort = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value.length > 0)
      setClientPort(Number(event.target.value));
  };

  const handleChangeServerPort = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value.length > 0)
      setServerPort(Number(event.target.value));
  };

  const handleChangeText = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value != "") {
      setText(event.target.value);
    }
  };

  const handleSendText = () => {
    if (socketService.isSocketConnected && text.length != 0) {
      socketService.sendMessage(text);
      setMessage([...messages, text]);
      setText("");
    }
  };

  useEffect(() => {
    socketService.subscribeToMessages(getNewMessage);

    return () => {
      socketService.unsubscribeFromMessages(getNewMessage);
      socketService.disconnect();
    };
  }, [socketService]);

  return (
    <div>
      <div style={{ display: "flex" }}>
        <input
          type="text"
          placeholder="client port"
          value={clientPort}
          onChange={handleChangeClientPort}
        />
        <input
          type="text"
          placeholder="server port"
          value={serverPort}
          onChange={handleChangeServerPort}
        />
        <button onClick={handlePostListenerData}>Ок</button>
      </div>
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
            onClick={handleConnectSocket}
            style={{
              width: "max-content",
              height: "30px",
              backgroundColor: "green",
            }}
          >
            Connect
          </button>
          <button
            onClick={handleDisconnectSocket}
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
    </div>
  );
}

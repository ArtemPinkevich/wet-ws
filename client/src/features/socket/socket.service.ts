import ISocketSevice from './ISocketSevice';

export class SocketSevice implements ISocketSevice {
  private readonly URL = 'ws://localhost:3002';

  private _socket!: WebSocket;
  private messageCallbacks: ((message: string) => void)[] = [];

  public connect() {
    if (!this.isSocketConnected) {
      this._socket = new WebSocket(this.URL);

      this._socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    }
  }

  public disconnect() {
    if (this.isSocketConnected) {
      this._socket.close();
    }
  }

  public sendMessage(message: string) {
    if (this.isSocketConnected) {
      this._socket.send(message);
    }
  }

  public subscribeToMessages(callback: (message: string) => void) {
    this.messageCallbacks.push(callback);
  }

  public unsubscribeFromMessages(callback: (message: string) => void) {
    this.messageCallbacks = this.messageCallbacks.filter(
      (cb) => cb !== callback,
    );
  }

  private handleMessage(message: string) {
    this.messageCallbacks.forEach((callback) => callback(message));
  }

  public get isSocketConnected(): boolean {
    return (
      this._socket !== undefined && this._socket.readyState === WebSocket.OPEN
    );
  }
}

export default interface ISocketSevice {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: string) => void;
}

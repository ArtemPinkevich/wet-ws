import axios from "axios";
import { IListenerData } from "../interface/IListenerData";

const URL = "http://localhost:3002/api/ws-ports";

const postListenerData = async ({ clientPort, serverPort }: IListenerData) => {
  if (clientPort && serverPort) {
    await axios.post(URL, {
      clientPort: clientPort,
      serverPort: serverPort,
    });
  }
};

export default postListenerData;

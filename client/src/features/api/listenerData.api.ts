import axios from 'axios';

import { BASE_SERVER_URL, ServerUrlRoute } from '../constants/api';
import { IListenerData } from '../interface/IListenerData';

const postListenerData = async ({ clientPort, serverPort }: IListenerData) => {
  if (clientPort && serverPort) {
    await axios
      .post(BASE_SERVER_URL + ServerUrlRoute.postPortsListener, {
        clientPort: clientPort,
        serverPort: serverPort,
      })
      .catch((error) => {
        console.log(error.message);
      });
  }
};

export default postListenerData;

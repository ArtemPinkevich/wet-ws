import { Request, Response } from "express";
import { writeTextJson } from "../helper/json.helper";

export class ListenerData {
  static async saveInJson(req: Request, res: Response) {
    try {
      const { clientPort, serverPort } = req.body;
      if (clientPort && serverPort) {
        writeTextJson({
          clientPort: Number(clientPort),
          serverPort: Number(serverPort),
        });

        res.status(200).json({ message: "Ports successfully save in server!" });
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
}

import { Request, Response } from "express";
import { writeTextJson } from "../helper/json.helper";

export class ListenerData {
  static async saveInJson(req: Request, res: Response) {
    try {
      const { ip, port, abonentType } = req.body;

      if (ip && port) {
        writeTextJson({
          abonentType: abonentType,
          clientPort: ip,
          serverPort: port,
        });

        res
          .status(200)
          .json({ message: "IP and PORT successfully save in server!" });
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
}

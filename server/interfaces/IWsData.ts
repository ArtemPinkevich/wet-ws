import { AbonentType } from "enums/AbonentType";

export default interface IWsData {
  abonentType: AbonentType;
  clientPort: number;
  serverPort: number;
}

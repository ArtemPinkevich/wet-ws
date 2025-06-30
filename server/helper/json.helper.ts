import fse from "fs-extra";
import IWsData from "interfaces/IWsData";

const jsonFilePath = "./database/db.json";

function writeTextJson(data: IWsData) {
  fse.writeFileSync(jsonFilePath, JSON.stringify(data));
}

function readTextJson(): IWsData {
  const data = JSON.parse(fse.readFileSync(jsonFilePath, "utf-8")) as IWsData;

  return data;
}

export { writeTextJson, readTextJson };

import { Router } from "express";
import { ListenerData } from "../controller/controller";

const router = Router();

router.post("/ws-ports", ListenerData.saveInJson);

export default router;

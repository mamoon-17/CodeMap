import { Router } from "express";
import { queryController } from "./query.controller";

const router = Router();

router.post("/", queryController.agenticQuery);

export default router;

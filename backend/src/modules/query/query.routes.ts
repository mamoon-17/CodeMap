import { Router } from "express";
import { queryController } from "./query.controller";

const router = Router();

router.post("/", queryController.agenticQuery);
router.post("/ingest", queryController.ingestCodebase);

export default router;

import { Router } from "express";
import { queryController } from "./query.controller";

const router = Router();

router.post("/", queryController.agenticQuery);
router.post("/ingest", queryController.ingestCodebase);
router.post("/analyze-snippet", queryController.analyzeSnippet);
router.post("/ingest", queryController.ingestFiles);

export default router;

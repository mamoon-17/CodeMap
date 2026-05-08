import { Router } from "express";
import { reindexController } from "./reindex.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  (req, res, next) => authMiddleware.requireNonGuest(req, res, next),
  reindexController.start,
);

router.get(
  "/:jobId",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  (req, res, next) => authMiddleware.requireNonGuest(req, res, next),
  reindexController.getStatus,
);

export default router;


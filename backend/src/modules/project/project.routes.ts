import { Router } from "express";
import multer from "multer";
import { projectController } from "./project.controller";

const upload = multer({ dest: "uploads/" });
const router = Router();

router.get("/", (req, res) => projectController.listAll(req, res));

router.post("/upload", upload.single("file"), (req, res) =>
  projectController.uploadRepo(req, res),
);

export default router;

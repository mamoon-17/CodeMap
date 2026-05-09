import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { projectController } from "./project.controller";

const MAX_ZIP_UPLOAD_BYTES = 50 * 1024 * 1024;
const ZIP_TOO_LARGE_MESSAGE =
  "ZIP file is too large. Please upload a repository archive under 50 MB and remove folders like node_modules, .git, dist, build, or .venv.";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_ZIP_UPLOAD_BYTES },
});
const router = Router();

const uploadSingleZip = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: ZIP_TOO_LARGE_MESSAGE });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};

router.get("/", (req, res) => projectController.listAll(req, res));

router.post("/upload", uploadSingleZip, (req, res) =>
  projectController.uploadRepo(req, res),
);

router.post("/:id/retry", (req, res) => projectController.retry(req, res));

router.get("/:id/files", (req, res) => projectController.listFiles(req, res));

router.get("/:id/files/content", (req, res) =>
  projectController.getFileContent(req, res),
);

router.delete("/:id/vectors", (req, res) =>
  projectController.deleteVectors(req, res),
);

export default router;

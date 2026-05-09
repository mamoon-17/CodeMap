import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { projectController } from "./project.controller";

const MAX_RAW_ZIP_UPLOAD_BYTES = 250 * 1024 * 1024;
const ZIP_TOO_LARGE_MESSAGE =
  "ZIP file is too large. Up to 50 MB source files are supported.";

const upload = multer({
  dest: "uploads/",
  // The real 50 MB application limit is enforced after ignored ZIP contents
  // are removed. This raw cap only protects the server from huge requests.
  limits: { fileSize: MAX_RAW_ZIP_UPLOAD_BYTES },
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

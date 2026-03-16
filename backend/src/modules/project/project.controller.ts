import { Request, Response } from "express";
import { projectService } from "./project.service";

class ProjectController {
  async uploadRepo(req: Request, res: Response) {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const name =
      (req.body.name as string) || req.file.originalname.replace(".zip", "");
    const result = await projectService.createFromUpload(name, req.file.path);

    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(201).json({
      project: result.value.project,
      fileCount: result.value.files.length,
    });
  }
}

export const projectController = new ProjectController();

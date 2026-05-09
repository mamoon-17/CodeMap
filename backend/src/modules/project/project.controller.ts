import { Request, Response } from "express";
import { projectService } from "./project.service";

class ProjectController {
  async listAll(_req: Request, res: Response) {
    const result = await projectService.listAll();
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json(result.value);
  }

  async uploadRepo(req: Request, res: Response) {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const name =
      (req.body.name as string) || req.file.originalname.replace(".zip", "");
    const result = await projectService.createFromUpload(
      name,
      req.file.path,
      req.file.originalname,
    );

    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(201).json({
      project: result.value.project,
      fileCount: result.value.files.length,
    });
  }

  async retry(req: Request, res: Response) {
    const rawId = req.params.id;
    const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!projectId) {
      res.status(400).json({ error: "Missing project id" });
      return;
    }

    const result = await projectService.retryIngest(projectId);
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json({
      project: result.value.project,
      indexed: result.value.indexed,
      fileCount: result.value.project.fileCount,
    });
  }
}

export const projectController = new ProjectController();

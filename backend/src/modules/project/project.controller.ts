import { Request, Response } from "express";
import { projectService } from "./project.service";
import { ProjectStatus } from "./project.entity";

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

    const statusCode = result.value.project.status === "failed" ? 202 : 201;
    res.status(statusCode).json({
      project: result.value.project,
      fileCount: result.value.files.length,
      ...(result.value.indexingError ? { error: result.value.indexingError } : {}),
    });
  }

  async addPublicRepo(req: Request, res: Response) {
    if (!req.user?.id) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const repoUrl = String(req.body?.repo_url || req.body?.url || "").trim();
    if (!repoUrl) {
      res.status(400).json({ error: "repo_url is required" });
      return;
    }

    const result = await projectService.createFromPublicRepoUrl(
      req.user.id,
      repoUrl,
    );
    if (result.isErr()) {
      const status = result.error.includes("already linked") ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    const { repository, status, projectId, fileCount, indexingError } = result.value;
    const statusCode = status === ProjectStatus.FAILED ? 202 : 201;

    const githubUpdatedAt =
      repository.githubPushedAt || repository.githubUpdatedAt || null;
    const lastIndexedAt = repository.lastIndexedAt;
    const hasChanges =
      githubUpdatedAt && lastIndexedAt
        ? githubUpdatedAt.getTime() > lastIndexedAt.getTime()
        : false;

    res.status(statusCode).json({
      success: true,
      data: {
        project_id: projectId,
        status,
        file_count: fileCount,
        repository: {
          id: Number(repository.githubRepoId),
          full_name: repository.fullName,
          language: repository.language,
          size: repository.size,
          updated_at: repository.githubUpdatedAt
            ? repository.githubUpdatedAt.toISOString()
            : null,
          pushed_at: repository.githubPushedAt
            ? repository.githubPushedAt.toISOString()
            : null,
          last_indexed_at: repository.lastIndexedAt
            ? repository.lastIndexedAt.toISOString()
            : null,
          has_changes: hasChanges,
          needs_reindex: repository.needsReindex || hasChanges,
        },
        ...(indexingError ? { error: indexingError } : {}),
      },
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

  async deleteVectors(req: Request, res: Response) {
    const rawId = req.params.id;
    const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!projectId) {
      res.status(400).json({ error: "Missing project id" });
      return;
    }

    const result = await projectService.deleteVectorsAndMaybeProject(projectId);
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json({ deleted: result.value.deleted });
  }
}

export const projectController = new ProjectController();

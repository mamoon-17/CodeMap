import { Request, Response } from "express";
import { projectService } from "./project.service";
import { publicRepoService, type AddPublicRepoError } from "./public-repo.service";
import { queryService } from "../query/query.service";

function httpStatusForPublicRepoError(error: AddPublicRepoError): number {
  switch (error.kind) {
    case "invalid_url":
      return 400;
    case "not_found":
      return 404;
    case "private":
      return 403;
    case "empty":
    case "too_large":
      return 422;
    case "duplicate":
      return 409;
    case "github_error":
      return 502;
    case "internal":
    default:
      return 500;
  }
}

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

  async listFiles(req: Request, res: Response) {
    const rawId = req.params.id;
    const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!projectId) {
      res.status(400).json({ error: "Missing project id" });
      return;
    }

    const result = await queryService.listProjectFiles(projectId);
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json(result.value);
  }

  async getFileContent(req: Request, res: Response) {
    const rawId = req.params.id;
    const projectId = Array.isArray(rawId) ? rawId[0] : rawId;
    const rawPath = req.query.path;
    const filePath = Array.isArray(rawPath) ? rawPath[0] : rawPath;

    if (!projectId) {
      res.status(400).json({ error: "Missing project id" });
      return;
    }
    if (!filePath || typeof filePath !== "string") {
      res.status(400).json({ error: "Missing file path" });
      return;
    }

    const result = await queryService.getProjectFileContent(projectId, filePath);
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json(result.value);
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

  async addPublicRepo(req: Request, res: Response) {
    if (!req.user?.id) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const rawUrl = (req.body?.url as unknown) ?? "";
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      res.status(400).json({ error: "Repository URL is required." });
      return;
    }

    const result = await publicRepoService.addPublicRepo(req.user.id, rawUrl);
    if (result.isErr()) {
      res
        .status(httpStatusForPublicRepoError(result.error))
        .json({ error: result.error.message, kind: result.error.kind });
      return;
    }

    res.status(201).json({ repository: result.value });
  }

  async listPublicRepos(req: Request, res: Response) {
    if (!req.user?.id) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const result = await publicRepoService.listPublicRepos(req.user.id);
    if (result.isErr()) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json({
      repositories: result.value,
      count: result.value.length,
    });
  }

  async removePublicRepo(req: Request, res: Response) {
    if (!req.user?.id) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const rawId = req.params.githubRepoId;
    const githubRepoId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!githubRepoId) {
      res.status(400).json({ error: "Missing githubRepoId" });
      return;
    }

    const removeLink = await publicRepoService.removePublicRepo(
      req.user.id,
      githubRepoId,
    );
    if (removeLink.isErr()) {
      res.status(500).json({ error: removeLink.error });
      return;
    }

    // Best-effort: clean vectors for the repo so a "removed" repo really disappears.
    const vectorsResult = await queryService.deleteProjectVectors(
      `gh_${githubRepoId}`,
    );
    const warnings = vectorsResult.isErr() ? [vectorsResult.error] : [];

    res.status(200).json({
      removed: removeLink.value.removed,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  }
}

export const projectController = new ProjectController();

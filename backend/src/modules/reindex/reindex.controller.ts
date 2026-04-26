import { Request, Response, NextFunction } from "express";
import { reindexService } from "./reindex.service";

class ReindexController {
  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const result = await reindexService.startReindex(req.user.id, req.body);
      return result.match(
        (job) =>
          res.status(202).json({
            success: true,
            data: {
              job_id: job.id,
              status: job.status,
              project_id: job.projectId,
              repo_id: job.githubRepoId,
            },
          }),
        (error) => res.status(400).json({ success: false, error }),
      );
    } catch (e) {
      return next(e);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const jobId = String(req.params.jobId || "");
      const result = await reindexService.getJob(jobId, req.user.id);

      return result.match(
        (job) =>
          res.status(200).json({
            success: true,
            data: {
              job_id: job.id,
              status: job.status,
              project_id: job.projectId,
              repo_id: job.githubRepoId,
              indexed_chunks: job.indexedChunks,
              skipped_files_count: job.skippedFilesCount,
              skipped_files: job.skippedFiles,
              error: job.error,
              updated_at: job.updatedAt,
              created_at: job.createdAt,
            },
          }),
        (error) => res.status(404).json({ success: false, error }),
      );
    } catch (e) {
      return next(e);
    }
  };
}

export const reindexController = new ReindexController();


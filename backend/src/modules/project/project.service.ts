import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { AppDataSource } from "../../config/datasource";
import { queryService } from "../query/query.service";
import {
  deleteObject,
  uploadObject,
} from "../../integrations/supabase/supabaseClient";
import { Project, ProjectStatus } from "./project.entity";
import { RepositoryRecord } from "./repository.entity";

const STORAGE_BUCKET = "codemap-projects";

function sanitizeForKey(input: string): string {
  const base = path.basename(input);
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "repo.zip";
}

function isZipFile(zipPath: string): boolean {
  try {
    const fd = fs.openSync(zipPath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    // ZIP signatures: PK\x03\x04 (local), PK\x05\x06 (empty archive), PK\x07\x08 (spanned)
    return header[0] === 0x50 && header[1] === 0x4b;
  } catch {
    return false;
  }
}

class ProjectService {
  async listAll(): Promise<Result<Project[], string>> {
    try {
      const repo = AppDataSource.getRepository(Project);
      const projects = await repo.find({ order: { createdAt: "DESC" } });
      return ok(projects);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message);
    }
  }

  async createFromUpload(
    name: string,
    zipPath: string,
    originalFilename?: string,
  ): Promise<
    Result<
      { project: Project; files: string[]; indexingError?: string },
      string
    >
  > {
    let repo: any = null;
    let saved: Project | null = null;
    let storagePath: string | null = null;
    try {
      repo = AppDataSource.getRepository(Project);
      const project = repo.create({ name, status: ProjectStatus.INDEXING });
      saved = await repo.save(project);

      if (!saved) {
        return err("Failed to save project");
      }

      const stat = await fs.promises.stat(zipPath).catch(() => null);
      if (!stat || stat.size === 0) {
        return err("Upload failed: Empty or missing ZIP file");
      }
      if (!isZipFile(zipPath)) {
        return err("Upload failed: File is not a valid ZIP archive");
      }

      // Quick sanity check: make sure it's a valid ZIP before uploading
      try {
        const zip = new AdmZip(zipPath);
        zip.getEntries();
      } catch {
        return err("Upload failed: Corrupt or unreadable ZIP archive");
      }

      // Upload raw (unfiltered) ZIP to Supabase Storage.
      // FastAPI will handle filtering, chunking, and embedding.
      const rawZipBytes = await fs.promises.readFile(zipPath);
      const keyName = sanitizeForKey(originalFilename || `${name}.zip`);
      storagePath = `projects/${saved.id}/${Date.now()}-${keyName}`;
      await uploadObject(STORAGE_BUCKET, storagePath, rawZipBytes, {
        contentType: "application/zip",
        upsert: false,
      });
      saved.zipStoragePath = storagePath;
      await repo.save(saved);

      // Call FastAPI storage-based ingest — no file content sent over the wire
      const ingestResult = await queryService.ingestFromStorage({
        project_id: saved.id,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        replace_project: true,
      });
      if (ingestResult.isErr()) {
        saved.status = ProjectStatus.FAILED;
        await repo.save(saved);
        return ok({
          project: saved,
          files: [],
          indexingError: ingestResult.error,
        });
      }

      saved.status = ProjectStatus.READY;
      saved.fileCount = ingestResult.value.file_count;
      await repo.save(saved);

      // FastAPI deletes the storage object on success.
      // Clear the local reference so we don't try again.
      saved.zipStoragePath = null;
      await repo.save(saved);

      return ok({ project: saved, files: [] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (repo && saved) {
        try {
          saved.status = ProjectStatus.FAILED;
          await repo.save(saved);
        } catch {
          // Swallow errors from status update to avoid masking the original failure
        }
      }
      return err(`Upload failed: ${message}`);
    } finally {
      try {
        await fs.promises.unlink(zipPath);
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  async retryIngest(
    projectId: string,
  ): Promise<Result<{ project: Project; indexed: number }, string>> {
    const repo = AppDataSource.getRepository(Project);

    const project = await repo.findOne({ where: { id: projectId } });
    if (!project) return err("Project not found");
    if (!project.zipStoragePath) {
      return err("No stored ZIP found for this project (zipStoragePath is null)");
    }

    try {
      project.status = ProjectStatus.INDEXING;
      await repo.save(project);

      // Delegate entirely to FastAPI — it downloads, filters, indexes, and
      // deletes the storage object on success.
      const ingestResult = await queryService.ingestFromStorage({
        project_id: project.id,
        storage_bucket: STORAGE_BUCKET,
        storage_path: project.zipStoragePath,
        replace_project: true,
      });
      if (ingestResult.isErr()) {
        throw new Error(ingestResult.error);
      }

      project.status = ProjectStatus.READY;
      project.fileCount = ingestResult.value.file_count;
      await repo.save(project);

      // FastAPI deleted the storage object on success — clear local ref
      project.zipStoragePath = null;
      await repo.save(project);

      return ok({ project, indexed: ingestResult.value.indexed });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        project.status = ProjectStatus.FAILED;
        await repo.save(project);
      } catch {
        // ignore status persistence failure
      }
      return err(`Retry failed: ${message}`);
    }
  }

  async deleteVectorsAndMaybeProject(
    projectId: string,
  ): Promise<Result<{ deleted: boolean }, string>> {
    const vectorsResult = await queryService.deleteProjectVectors(projectId);
    if (vectorsResult.isErr()) return err(vectorsResult.error);

    // GitHub projects are not removed from UI; only vectors are wiped.
    if (projectId.startsWith("gh_")) {
      const githubRepoId = projectId.replace(/^gh_/, "");
      try {
        const repoRepo = AppDataSource.getRepository(RepositoryRecord);
        await repoRepo.update(
          { githubRepoId },
          { lastIndexedAt: null, needsReindex: true },
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(`Deleted vectors, but failed to update repo state: ${message}`);
      }
      return ok({ deleted: vectorsResult.value.deleted });
    }

    // Uploaded projects are removed from the UI: delete the row and best-effort delete any surviving storage object.
    try {
      const repo = AppDataSource.getRepository(Project);
      const project = await repo.findOne({ where: { id: projectId } });
      if (!project) return ok({ deleted: vectorsResult.value.deleted });

      if (project.zipStoragePath) {
        try {
          await deleteObject(STORAGE_BUCKET, project.zipStoragePath);
        } catch (e) {
          console.warn(
            `[projectService] Failed to delete storage object ${project.zipStoragePath}:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      await repo.delete({ id: projectId });
      return ok({ deleted: vectorsResult.value.deleted });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Deleted vectors, but failed to delete project row: ${message}`);
    }
  }
}

export const projectService = new ProjectService();

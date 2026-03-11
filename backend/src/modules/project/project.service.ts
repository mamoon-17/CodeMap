import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { appDataSource } from "../../config/datasource";
import { Project, ProjectStatus } from "./project.entity";

const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".rs",
  ".html",
  ".css",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
]);

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

class ProjectService {
  private getRepo() {
    const dsResult = appDataSource.getInstance();
    if (dsResult.isErr()) return err(dsResult.error);
    return ok(dsResult.value.getRepository(Project));
  }

  async createFromUpload(
    name: string,
    zipPath: string,
  ): Promise<Result<{ project: Project; files: string[] }, string>> {
    const repoResult = this.getRepo();
    if (repoResult.isErr()) return err(repoResult.error);
    const repo = repoResult.value;

    try {
      const project = repo.create({ name, status: ProjectStatus.INDEXING });
      const saved = await repo.save(project);

      const extractPath = path.join("uploads", saved.id);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractPath, true);

      const files = walkDir(extractPath);

      saved.status = ProjectStatus.READY;
      await repo.save(saved);

      return ok({ project: saved, files });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Upload failed: ${message}`);
    }
  }
}

export const projectService = new ProjectService();

import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { AppDataSource } from "../../config/datasource";
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

function safeExtractZip(zip: AdmZip, extractPath: string): void {
  const extractRoot = path.resolve(extractPath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryName = entry.entryName;
    const destPath = path.resolve(path.join(extractPath, entryName));

    // Prevent Zip Slip / path traversal: ensure destination is within extractRoot
    if (!destPath.startsWith(extractRoot + path.sep) && destPath !== extractRoot) {
      throw new Error("Invalid entry path in ZIP file");
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true });
      continue;
    }

    const destDir = path.dirname(destPath);
    fs.mkdirSync(destDir, { recursive: true });
    const data = entry.getData();
    fs.writeFileSync(destPath, data);
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
  ): Promise<Result<{ project: Project; files: string[] }, string>> {
    try {
      const repo = AppDataSource.getRepository(Project);
      const project = repo.create({ name, status: ProjectStatus.INDEXING });
      const saved = await repo.save(project);

      const extractPath = path.join("uploads", saved.id);
      const zip = new AdmZip(zipPath);
      safeExtractZip(zip, extractPath);

      const files = walkDir(extractPath);

      saved.status = ProjectStatus.READY;
      saved.fileCount = files.length;
      await repo.save(saved);

      return ok({ project: saved, files });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Upload failed: ${message}`);
    }
  }
}

export const projectService = new ProjectService();

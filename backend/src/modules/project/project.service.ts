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
  if (!fs.existsSync(dir)) return [];
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
  fs.mkdirSync(extractPath, { recursive: true });

  for (const entry of entries) {
    const entryName = entry.entryName;
    const destPath = path.resolve(path.join(extractPath, entryName));

    // Prevent Zip Slip / path traversal: ensure destination is within extractRoot
    if (
      !destPath.startsWith(extractRoot + path.sep) &&
      destPath !== extractRoot
    ) {
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
  ): Promise<Result<{ project: Project; files: string[] }, string>> {
    let repo: any = null;
    let saved: Project | null = null;
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

      const extractPath = path.join("uploads", saved.id);
      let zip: AdmZip;
      try {
        zip = new AdmZip(zipPath);
        // Force parsing to catch corrupt archives early
        zip.getEntries();
      } catch {
        return err("Upload failed: Corrupt or unreadable ZIP archive");
      }
      safeExtractZip(zip, extractPath);

      const files = walkDir(extractPath);
      if (files.length === 0) {
        return err(
          "Upload failed: No supported source files found in ZIP (allowed: .js, .ts, .py, .java, .cpp, .c, .cs, .go, .rb, .php, .swift, .kt, .rs, .html, .css, .json, .xml, .yaml, .yml)",
        );
      }

      saved.status = ProjectStatus.READY;
      saved.fileCount = files.length;
      await repo.save(saved);

      return ok({ project: saved, files });
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
}

export const projectService = new ProjectService();

import AdmZip from "adm-zip";
import fs from "fs";
import os from "os";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { AppDataSource } from "../../config/datasource";
import { queryService } from "../query/query.service";
import {
  deleteObject,
  downloadObject,
  uploadObject,
} from "../../integrations/supabase/supabaseClient";
import { Project, ProjectStatus } from "./project.entity";
import { RepositoryRecord } from "./repository.entity";
import { UserRepositoryLink } from "./linked-repository.entity";

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

const STORAGE_BUCKET = "codemap-projects";
const MAX_FILES_PER_UPLOAD = 500;
const MAX_FILE_BYTES = 250_000;

const IGNORED_DIR_SEGMENTS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".git",
] as const;

function sanitizeForKey(input: string): string {
  const base = path.basename(input);
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "repo.zip";
}

function normalizeZipEntryPath(entryName: string): string {
  const raw = entryName.replaceAll("\\", "/");
  // `path.posix.normalize` will collapse ../ and ./ segments consistently
  const normalized = path.posix.normalize(raw);
  return normalized.replace(/^(\.\/)+/, "");
}

function shouldIgnorePath(normalizedPosixPath: string): boolean {
  const parts = normalizedPosixPath.split("/").filter(Boolean);
  return parts.some((p) => (IGNORED_DIR_SEGMENTS as readonly string[]).includes(p));
}

function isUnsafeZipEntryPath(entryName: string): boolean {
  if (!entryName) return true;
  if (entryName.includes("\u0000")) return true;
  const normalized = normalizeZipEntryPath(entryName);
  if (normalized === "." || normalized === "..") return true;
  if (normalized.startsWith("../") || normalized.includes("/../")) return true;
  if (normalized.startsWith("/")) return true;
  // Windows drive-letter absolute paths inside zips (e.g. C:\foo)
  if (/^[a-zA-Z]:\//.test(normalized)) return true;
  return false;
}

function isProbablyBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return true;
    const isAllowed =
      b === 9 || // \t
      b === 10 || // \n
      b === 13 || // \r
      (b >= 32 && b <= 126);
    if (!isAllowed) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.2;
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

function getZipRootPrefix(zip: AdmZip): string | null {
  const roots = new Set<string>();

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName;
    if (isUnsafeZipEntryPath(entryName)) continue;

    const normalized = normalizeZipEntryPath(entryName);
    const firstSegment = normalized.split("/").filter(Boolean)[0];
    if (!firstSegment) continue;
    roots.add(firstSegment);
    if (roots.size > 1) return null;
  }

  if (roots.size !== 1) return null;
  return Array.from(roots)[0] || null;
}

function buildIngestPayloadFromZip(
  zip: AdmZip,
  options: { stripRootDir?: boolean } = {},
): {
  files: Array<{ file_path: string; content: string }>;
  filePaths: string[];
} {
  const stripRootDir = options.stripRootDir ?? false;
  const rootPrefix = stripRootDir ? getZipRootPrefix(zip) : null;
  const files: Array<{ file_path: string; content: string }> = [];
  const filePaths: string[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    if (isUnsafeZipEntryPath(entryName)) {
      throw new Error("Invalid entry path in ZIP file");
    }

    let normalized = normalizeZipEntryPath(entryName);
    if (rootPrefix && normalized.startsWith(`${rootPrefix}/`)) {
      normalized = normalized.slice(rootPrefix.length + 1);
    }
    if (!normalized) continue;
    if (shouldIgnorePath(normalized)) continue;
    const ext = path.posix.extname(normalized).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const data = entry.getData();
    if (data.length > MAX_FILE_BYTES) continue;
    if (isProbablyBinary(data)) continue;
    if (files.length >= MAX_FILES_PER_UPLOAD) break;
    const content = data.toString("utf8");
    files.push({ file_path: normalized, content });
    filePaths.push(normalized);
  }

  return { files, filePaths };
}

function parseGithubRepoUrl(input: string): { owner: string; repo: string } | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const gitSshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (gitSshMatch && gitSshMatch[1] && gitSshMatch[2]) {
    return { owner: gitSshMatch[1], repo: gitSshMatch[2] };
  }

  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repoPart = parts[1];
    if (!owner || !repoPart) return null;
    const repo = repoPart.replace(/\.git$/, "");
    if (!repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

interface GithubRepoMetadata {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  language: string | null;
  size: number;
  owner: {
    login: string;
    avatar_url: string;
  };
  updated_at: string;
  pushed_at: string | null;
}

function hasRepoChanged(githubUpdatedAt: Date | null, lastIndexedAt: Date | null): boolean {
  if (!githubUpdatedAt || !lastIndexedAt) return false;
  return githubUpdatedAt.getTime() > lastIndexedAt.getTime();
}

async function fetchPublicGithubRepo(
  owner: string,
  repo: string,
): Promise<GithubRepoMetadata> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodeMap",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    throw new Error("Repository not found or not public");
  }

  const rateLimited =
    response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
  if (rateLimited) {
    throw new Error("GitHub rate limit exceeded. Please try again later.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API error ${response.status}: ${body || response.statusText}`,
    );
  }

  return (await response.json()) as GithubRepoMetadata;
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

      // Upload zip to Supabase Storage first (crash-safe holding area)
      const keyName = sanitizeForKey(originalFilename || `${name}.zip`);
      storagePath = `projects/${saved.id}/${Date.now()}-${keyName}`;
      const zipBytes = await fs.promises.readFile(zipPath);
      await uploadObject(STORAGE_BUCKET, storagePath, zipBytes, {
        contentType: "application/zip",
        upsert: false,
      });
      saved.zipStoragePath = storagePath;
      await repo.save(saved);

      let zip: AdmZip;
      try {
        zip = new AdmZip(zipPath);
        // Force parsing to catch corrupt archives early
        zip.getEntries();
      } catch {
        return err("Upload failed: Corrupt or unreadable ZIP archive");
      }

      const { files, filePaths } = buildIngestPayloadFromZip(zip);
      if (files.length === 0) {
        return err(
          "Upload failed: No supported source files found in ZIP (allowed: .js, .ts, .py, .java, .cpp, .c, .cs, .go, .rb, .php, .swift, .kt, .rs, .html, .css, .json, .xml, .yaml, .yml)",
        );
      }

      const ingestResult = await queryService.ingestFiles({
        project_id: saved.id,
        files,
        replace_project: true,
      });
      if (ingestResult.isErr()) {
        saved.status = ProjectStatus.FAILED;
        await repo.save(saved);
        return ok({
          project: saved,
          files: filePaths,
          indexingError: ingestResult.error,
        });
      }

      saved.status = ProjectStatus.READY;
      saved.fileCount = files.length;
      await repo.save(saved);

      // Delete from bucket immediately after successful ingest
      try {
        await deleteObject(STORAGE_BUCKET, storagePath);
        saved.zipStoragePath = null;
        await repo.save(saved);
      } catch (e) {
        // If delete fails, keep path for later cleanup/retry; do not fail the request.
        console.warn(
          `[projectService] Failed to delete storage object ${storagePath}:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      return ok({ project: saved, files: filePaths });
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

  async createFromPublicRepoUrl(
    userId: string,
    repoUrl: string,
  ): Promise<
    Result<
      {
        projectId: string;
        repository: RepositoryRecord;
        status: ProjectStatus;
        fileCount: number;
        indexingError?: string;
      },
      string
    >
  > {
    if (!userId) {
      return err("Authentication required");
    }

    const parsed = parseGithubRepoUrl(repoUrl);
    if (!parsed) {
      return err("Invalid GitHub repository URL");
    }

    const { owner, repo } = parsed;
    let metadata: GithubRepoMetadata;

    try {
      metadata = await fetchPublicGithubRepo(owner, repo);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(message);
    }

    if (metadata.private) {
      return err("Repository is private. Please provide a public repository.");
    }

    const repoRecordRepo = AppDataSource.getRepository(RepositoryRecord);
    const linkRepo = AppDataSource.getRepository(UserRepositoryLink);
    const githubRepoId = String(metadata.id);
    const existing = await repoRecordRepo.findOne({
      where: { githubRepoId },
    });
    const existingLink = await linkRepo.findOne({
      where: { userId, githubRepoId },
    });

    if (existingLink) {
      return err("Repository already linked");
    }

    const githubUpdatedAt = metadata.pushed_at
      ? new Date(metadata.pushed_at)
      : metadata.updated_at
        ? new Date(metadata.updated_at)
        : null;
    const existingLastIndexedAt = existing?.lastIndexedAt || null;
    const computedNeedsReindex =
      hasRepoChanged(githubUpdatedAt, existingLastIndexedAt) ||
      Boolean(existing?.needsReindex);

    await repoRecordRepo.upsert(
      [
        {
          ...(existing?.id ? { id: existing.id } : {}),
          githubRepoId,
          name: metadata.name,
          fullName: metadata.full_name,
          url: metadata.html_url,
          language: metadata.language,
          size: metadata.size,
          isPrivate: metadata.private,
          isFork: metadata.fork,
          ownerLogin: metadata.owner.login,
          ownerAvatarUrl: metadata.owner.avatar_url || null,
          githubUpdatedAt: metadata.updated_at ? new Date(metadata.updated_at) : null,
          githubPushedAt: metadata.pushed_at ? new Date(metadata.pushed_at) : null,
          lastIndexedAt: existing?.lastIndexedAt || null,
          needsReindex: computedNeedsReindex,
        },
      ],
      ["githubRepoId"],
    );

    const record = await repoRecordRepo.findOne({ where: { githubRepoId } });
    if (!record) {
      return err("Failed to persist repository metadata");
    }

    const projectId = `gh_${githubRepoId}`;

    try {
      await linkRepo.save(
        linkRepo.create({
          userId,
          githubRepoId,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.toLowerCase().includes("duplicate")) {
        return err("Repository already linked");
      }
      return err(`Failed to link repository: ${message}`);
    }

    if (record.lastIndexedAt && !record.needsReindex) {
      return ok({
        projectId,
        repository: record,
        status: ProjectStatus.READY,
        fileCount: 0,
      });
    }
    const tmpBase = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "codemap-public-"),
    );
    const zipPath = path.join(tmpBase, "repo.zip");

    let status: ProjectStatus = ProjectStatus.READY;
    let fileCount = 0;
    let indexingError: string | undefined;

    try {
      const zipballUrl = `https://api.github.com/repos/${metadata.full_name}/zipball`;
      const response = await fetch(zipballUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "CodeMap",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `GitHub zipball failed (${response.status}): ${body || response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.promises.writeFile(zipPath, Buffer.from(arrayBuffer));

      const zip = new AdmZip(zipPath);
      // Force parsing to catch corrupt archives early
      zip.getEntries();

      const { files, filePaths } = buildIngestPayloadFromZip(zip, {
        stripRootDir: true,
      });
      if (files.length === 0) {
        throw new Error(
          "No supported source files found (allowed: .js, .ts, .py, .java, .cpp, .c, .cs, .go, .rb, .php, .swift, .kt, .rs, .html, .css, .json, .xml, .yaml, .yml)",
        );
      }

      const ingestResult = await queryService.ingestFiles({
        project_id: projectId,
        files,
        replace_project: true,
      });

      if (ingestResult.isErr()) {
        throw new Error(ingestResult.error);
      }

      fileCount = filePaths.length;
      await repoRecordRepo.update(
        { githubRepoId },
        { lastIndexedAt: new Date(), needsReindex: false },
      );
      record.lastIndexedAt = new Date();
      record.needsReindex = false;
    } catch (e) {
      status = ProjectStatus.FAILED;
      indexingError = e instanceof Error ? e.message : String(e);
      await repoRecordRepo.update(
        { githubRepoId },
        { needsReindex: true },
      );
      record.needsReindex = true;
    } finally {
      try {
        await fs.promises.rm(tmpBase, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    const latestGithubUpdatedAt =
      record.githubPushedAt || record.githubUpdatedAt || null;
    const hasChanges = hasRepoChanged(
      latestGithubUpdatedAt,
      record.lastIndexedAt || null,
    );
    record.needsReindex = record.needsReindex || hasChanges;

    return ok({
      projectId,
      repository: record,
      status,
      fileCount,
      ...(indexingError ? { indexingError } : {}),
    });
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

      const zipArrayBuffer = await downloadObject(
        STORAGE_BUCKET,
        project.zipStoragePath,
      );
      const zipBytes = Buffer.from(zipArrayBuffer);

      let zip: AdmZip;
      try {
        zip = new AdmZip(zipBytes);
        zip.getEntries();
      } catch {
        return err("Retry failed: Corrupt or unreadable ZIP archive");
      }

      const { files } = buildIngestPayloadFromZip(zip);
      if (files.length === 0) {
        return err(
          "Retry failed: No supported source files found in ZIP (allowed: .js, .ts, .py, .java, .cpp, .c, .cs, .go, .rb, .php, .swift, .kt, .rs, .html, .css, .json, .xml, .yaml, .yml)",
        );
      }

      const ingestResult = await queryService.ingestFiles({
        project_id: project.id,
        files,
        replace_project: true,
      });
      if (ingestResult.isErr()) {
        throw new Error(ingestResult.error);
      }

      project.status = ProjectStatus.READY;
      project.fileCount = files.length;
      await repo.save(project);

      try {
        await deleteObject(STORAGE_BUCKET, project.zipStoragePath);
        project.zipStoragePath = null;
        await repo.save(project);
      } catch (e) {
        console.warn(
          `[projectService] Failed to delete storage object ${project.zipStoragePath}:`,
          e instanceof Error ? e.message : String(e),
        );
      }

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

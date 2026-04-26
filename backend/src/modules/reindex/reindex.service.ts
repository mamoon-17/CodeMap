import AdmZip from "adm-zip";
import fs from "fs";
import os from "os";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { AppDataSource } from "../../config/datasource";
import { User } from "../user/user.entity";
import { RepositoryRecord } from "../project/repository.entity";
import { queryService } from "../query/query.service";
import { ReindexJob, ReindexJobStatus } from "./reindex.entity";

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

const MAX_FILES_PER_REINDEX = 500;
const INGEST_BATCH_SIZE = 20;
const MAX_FILE_BYTES = 250_000;
const MAX_SKIPPED_FILES_LOG = 50;
const MAX_RETRIES = 3;

// Prevent duplicate job creation when multiple tabs click "Re-index" simultaneously.
// This is a best-effort single-instance lock (sufficient for local dev).
const startJobLocks = new Map<string, Promise<ReindexJob>>();

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt > maxRetries) throw e;
      const waitMs = Math.min(10_000, 500 * 2 ** (attempt - 1));
      console.warn(`[reindex] ${label} failed (attempt ${attempt}/${maxRetries}). Retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

function isProbablyBinary(buf: Buffer): boolean {
  // Heuristic: if the first chunk contains NUL, treat as binary.
  // Also count control chars.
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

function parseGithubRepoId(input: string): string | null {
  const trimmed = String(input || "").trim();
  const ghMatch = trimmed.match(/^gh_(\d+)$/);
  if (ghMatch && ghMatch[1]) return ghMatch[1];
  const numericMatch = trimmed.match(/^(\d+)$/);
  if (numericMatch && numericMatch[1]) return numericMatch[1];
  return null;
}

export class ReindexService {
  async startReindex(
    userId: string,
    input: { project_id?: string; repo_id?: string },
  ): Promise<Result<ReindexJob, string>> {
    try {
      const githubRepoId =
        parseGithubRepoId(input.repo_id || "") ||
        parseGithubRepoId(input.project_id || "");

      if (!githubRepoId) {
        return err("repo_id or project_id must be a GitHub repo id (e.g. 123 or gh_123)");
      }

      const projectId = `gh_${githubRepoId}`;

      const jobRepo = AppDataSource.getRepository(ReindexJob);

      const lockKey = `${userId}:${githubRepoId}`;
      const inFlight = startJobLocks.get(lockKey);
      if (inFlight) {
        return ok(await inFlight);
      }

      const startPromise = (async () => {
        // Prevent duplicate indexing: if a job is already running for this repo+user,
        // return the existing job instead of starting another one.
        const existing = await jobRepo.findOne({
          where: {
            userId,
            githubRepoId,
            status: ReindexJobStatus.STARTED,
          },
          order: { createdAt: "DESC" },
        });
        if (existing) return existing;

        const job = jobRepo.create({
          userId,
          githubRepoId,
          projectId,
          status: ReindexJobStatus.STARTED,
          error: null,
          indexedChunks: 0,
          skippedFilesCount: 0,
          skippedFiles: null,
        });
        const saved = await jobRepo.save(job);

        // Fire-and-forget background execution
        void this.runJob(saved.id).catch((e) => {
          console.error("[reindex] job crashed:", e);
        });

        return saved;
      })();

      startJobLocks.set(lockKey, startPromise);
      try {
        return ok(await startPromise);
      } finally {
        startJobLocks.delete(lockKey);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to start reindex: ${message}`);
    }
  }

  async getJob(jobId: string, userId: string): Promise<Result<ReindexJob, string>> {
    try {
      const jobRepo = AppDataSource.getRepository(ReindexJob);
      const job = await jobRepo.findOne({ where: { id: jobId, userId } });
      if (!job) return err("Reindex job not found");
      return ok(job);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to load job: ${message}`);
    }
  }

  private async runJob(jobId: string): Promise<void> {
    const jobRepo = AppDataSource.getRepository(ReindexJob);
    const userRepo = AppDataSource.getRepository(User);
    const repoRecordRepo = AppDataSource.getRepository(RepositoryRecord);

    const job = await jobRepo.findOne({ where: { id: jobId } });
    if (!job) return;

    const user = await userRepo.findOne({ where: { id: job.userId } });
    if (!user?.githubAccessToken) {
      await jobRepo.update(
        { id: jobId },
        { status: ReindexJobStatus.FAILED, error: "GitHub not connected" },
      );
      return;
    }

    const record = await repoRecordRepo.findOne({
      where: { githubRepoId: job.githubRepoId },
    });
    if (!record?.fullName) {
      await jobRepo.update(
        { id: jobId },
        {
          status: ReindexJobStatus.FAILED,
          error: "Repository record not found (call /users/repos first)",
        },
      );
      return;
    }

    const tmpBase = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "codemap-reindex-"),
    );
    const zipPath = path.join(tmpBase, "repo.zip");
    const extractPath = path.join(tmpBase, "repo");

    try {
      // Download repo zipball
      const zipballUrl = `https://api.github.com/repos/${record.fullName}/zipball`;
      const response = await withRetry("download zipball", async () => {
        const res = await fetch(zipballUrl, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${user.githubAccessToken}`,
            "User-Agent": "CodeMap",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `GitHub zipball failed (${res.status}): ${body || res.statusText}`,
          );
        }
        return res;
      });

      const arrayBuffer = await response.arrayBuffer();
      await fs.promises.writeFile(zipPath, Buffer.from(arrayBuffer));

      const zip = new AdmZip(zipPath);
      safeExtractZip(zip, extractPath);

      // Zipball includes a single root folder; we want to ingest paths relative to that root.
      const rootEntries = fs.readdirSync(extractPath);
      const repoRoot =
        rootEntries.length === 1 && rootEntries[0]
          ? path.join(extractPath, rootEntries[0])
          : extractPath;

      const filePaths = walkDir(repoRoot);
      if (filePaths.length === 0) {
        throw new Error("No supported files found to ingest");
      }

      // Stream/iterate through repo files in small batches to keep memory low.
      // First batch uses replace_project=true (fresh reindex). Remaining batches append.
      let isFirstBatch = true;
      let totalIndexedChunks = 0;
      let acceptedFiles = 0;
      let skippedFilesCount = 0;
      const skippedFiles: Array<{ file: string; reason: string }> = [];
      let batch: Array<{ file_path: string; content: string }> = [];

      const flushBatch = async () => {
        if (batch.length === 0) return;
        const ingestResult = await withRetry("ingest batch", async () =>
          queryService.ingestCodebase({
            project_id: job.projectId,
            files: batch,
            replace_project: isFirstBatch,
          }),
        );
        if (ingestResult.isErr()) {
          throw new Error(ingestResult.error);
        }
        totalIndexedChunks += ingestResult.value.indexed;
        batch = [];
        isFirstBatch = false;
      };

      for (const fullPath of filePaths) {
        if (acceptedFiles >= MAX_FILES_PER_REINDEX) break;

        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_BYTES) {
          skippedFilesCount += 1;
          const rel = path
            .relative(repoRoot, fullPath)
            .split(path.sep)
            .join("/");
          if (skippedFiles.length < MAX_SKIPPED_FILES_LOG) {
            skippedFiles.push({
              file: rel,
              reason: `size>${MAX_FILE_BYTES} bytes`,
            });
          }
          continue;
        }

        const rel = path
          .relative(repoRoot, fullPath)
          .split(path.sep)
          .join("/");

        const raw = fs.readFileSync(fullPath);
        if (isProbablyBinary(raw)) {
          skippedFilesCount += 1;
          if (skippedFiles.length < MAX_SKIPPED_FILES_LOG) {
            skippedFiles.push({ file: rel, reason: "binary" });
          }
          continue;
        }

        const content = raw.toString("utf8");
        batch.push({ file_path: rel, content });
        acceptedFiles += 1;

        if (batch.length >= INGEST_BATCH_SIZE) {
          await flushBatch();
        }
      }

      await flushBatch();

      if (acceptedFiles === 0) {
        throw new Error("No supported files found to ingest");
      }

      // Persist sync-state in RepositoryRecord (for Dashboard change detection)
      await repoRecordRepo.update(
        { githubRepoId: job.githubRepoId },
        { lastIndexedAt: new Date(), needsReindex: false },
      );

      await jobRepo.update(
        { id: jobId },
        {
          status: ReindexJobStatus.COMPLETED,
          error: null,
          indexedChunks: totalIndexedChunks,
          skippedFilesCount,
          skippedFiles: skippedFiles.length > 0 ? skippedFiles : null,
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await jobRepo.update(
        { id: jobId },
        { status: ReindexJobStatus.FAILED, error: message },
      );
    } finally {
      try {
        await fs.promises.rm(tmpBase, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

export const reindexService = new ReindexService();


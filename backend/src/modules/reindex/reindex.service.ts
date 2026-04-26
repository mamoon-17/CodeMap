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
      const job = jobRepo.create({
        userId,
        githubRepoId,
        projectId,
        status: ReindexJobStatus.STARTED,
        error: null,
        indexedChunks: 0,
      });
      const saved = await jobRepo.save(job);

      // Fire-and-forget background execution
      void this.runJob(saved.id).catch((e) => {
        console.error("[reindex] job crashed:", e);
      });

      return ok(saved);
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
      const response = await fetch(zipballUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${user.githubAccessToken}`,
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
      safeExtractZip(zip, extractPath);

      // Zipball includes a single root folder; we want to ingest paths relative to that root.
      const rootEntries = fs.readdirSync(extractPath);
      const repoRoot =
        rootEntries.length === 1 && rootEntries[0]
          ? path.join(extractPath, rootEntries[0])
          : extractPath;

      const filePaths = walkDir(repoRoot);
      const files: Array<{ file_path: string; content: string }> = [];

      for (const fullPath of filePaths) {
        const rel = path
          .relative(repoRoot, fullPath)
          .split(path.sep)
          .join("/");
        const stat = fs.statSync(fullPath);
        if (stat.size > 250_000) continue; // skip very large files
        const content = fs.readFileSync(fullPath, "utf8");
        files.push({ file_path: rel, content });
        if (files.length >= 500) break; // cap to avoid overloading local dev
      }

      if (files.length === 0) {
        throw new Error("No supported files found to ingest");
      }

      const ingestResult = await queryService.ingestCodebase({
        project_id: job.projectId,
        files,
        replace_project: true,
      });

      if (ingestResult.isErr()) {
        throw new Error(ingestResult.error);
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
          indexedChunks: ingestResult.value.indexed,
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


import { In } from "typeorm";
import { Result, err, ok } from "neverthrow";
import { AppDataSource } from "../../config/datasource";
import { PublicRepoLink } from "./public-repo-link.entity";
import { RepositoryRecord } from "./repository.entity";

const MAX_PUBLIC_REPO_SIZE_KB = 250 * 1024; // 250 MB (GitHub `size` is reported in KB)

interface GithubPublicRepoApi {
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

export interface PublicRepoListItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  language: string | null;
  size: number;
  owner: { login: string; avatar_url: string };
  updated_at: string;
  pushed_at: string | null;
  last_indexed_at: string | null;
  has_changes: boolean;
  needs_reindex: boolean;
  source: "public";
}

export type AddPublicRepoError =
  | { kind: "invalid_url"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "private"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "too_large"; message: string }
  | { kind: "duplicate"; message: string }
  | { kind: "github_error"; message: string }
  | { kind: "internal"; message: string };

/**
 * Accept the most common public-repo URL shapes and return `{owner, repo}`.
 * - `https://github.com/owner/repo`
 * - `https://github.com/owner/repo.git`
 * - `https://github.com/owner/repo/` (trailing slash)
 * - `git@github.com:owner/repo.git` (SSH)
 * - bare `owner/repo`
 */
export function parseGithubRepoUrl(
  input: string,
): Result<{ owner: string; repo: string }, string> {
  const raw = String(input || "").trim();
  if (!raw) return err("Repository URL is required.");

  const stripGitSuffix = (s: string) => s.replace(/\.git$/i, "");
  const validIdent = /^[A-Za-z0-9._-]+$/;

  const tryPair = (owner?: string, repo?: string) => {
    if (!owner || !repo) return null;
    const cleanRepo = stripGitSuffix(repo);
    if (!validIdent.test(owner) || !validIdent.test(cleanRepo)) return null;
    return { owner, repo: cleanRepo };
  };

  // SSH form: git@github.com:owner/repo(.git)
  const sshMatch = raw.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    const pair = tryPair(sshMatch[1], sshMatch[2]);
    if (pair) return ok(pair);
  }

  // https URL
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host === "github.com" || host === "www.github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const pair = tryPair(parts[0], parts[1]);
        if (pair) return ok(pair);
      }
    }
  } catch {
    // fall through to bare owner/repo handling
  }

  // bare owner/repo
  const bare = raw.split("/").filter(Boolean);
  if (bare.length === 2) {
    const pair = tryPair(bare[0], bare[1]);
    if (pair) return ok(pair);
  }

  return err(
    "Could not parse repository URL. Expected something like https://github.com/owner/repo.",
  );
}

function getRepoChangeTimestamp(repo: {
  pushed_at?: string | null;
  updated_at?: string | null;
}): Date | null {
  const raw = repo.pushed_at || repo.updated_at || null;
  return raw ? new Date(raw) : null;
}

function hasRepoChanged(
  githubUpdatedAt: Date | null,
  lastIndexedAt: Date | null,
): boolean {
  if (!githubUpdatedAt || !lastIndexedAt) return false;
  return githubUpdatedAt.getTime() > lastIndexedAt.getTime();
}

async function fetchPublicGithubRepo(
  owner: string,
  repo: string,
): Promise<Result<GithubPublicRepoApi, AddPublicRepoError>> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CodeMap",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ kind: "github_error", message: `GitHub unreachable: ${message}` });
  }

  if (response.status === 404) {
    return err({
      kind: "not_found",
      message: "Repository not found. Make sure the URL points to a public GitHub repo.",
    });
  }

  // GitHub returns 403 when the unauthenticated rate limit is exhausted; surface that clearly.
  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    return err({
      kind: "github_error",
      message: `GitHub rate limit reached or access denied: ${body || response.statusText}`,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return err({
      kind: "github_error",
      message: `GitHub API error (${response.status}): ${body || response.statusText}`,
    });
  }

  const data = (await response.json()) as GithubPublicRepoApi;
  return ok(data);
}

class PublicRepoService {
  private linkRepo() {
    return AppDataSource.getRepository(PublicRepoLink);
  }

  private repoRecordRepo() {
    return AppDataSource.getRepository(RepositoryRecord);
  }

  async addPublicRepo(
    userId: string,
    inputUrl: string,
  ): Promise<Result<PublicRepoListItem, AddPublicRepoError>> {
    const parseResult = parseGithubRepoUrl(inputUrl);
    if (parseResult.isErr()) {
      return err({ kind: "invalid_url", message: parseResult.error });
    }
    const { owner, repo } = parseResult.value;

    const fetched = await fetchPublicGithubRepo(owner, repo);
    if (fetched.isErr()) return err(fetched.error);
    const ghRepo = fetched.value;

    if (ghRepo.private) {
      return err({
        kind: "private",
        message: "That repository is private. Connect GitHub to index your private repos.",
      });
    }
    if (ghRepo.size === 0) {
      return err({
        kind: "empty",
        message: "Repository is empty (no source files to index).",
      });
    }
    if (ghRepo.size > MAX_PUBLIC_REPO_SIZE_KB) {
      return err({
        kind: "too_large",
        message: `Repository is too large (${ghRepo.size} KB). Up to ${MAX_PUBLIC_REPO_SIZE_KB} KB is supported.`,
      });
    }

    const githubRepoId = String(ghRepo.id);

    // Dedupe: a user can link the same public repo only once.
    const linkRepo = this.linkRepo();
    const existingLink = await linkRepo.findOne({
      where: { userId, githubRepoId },
    });
    if (existingLink) {
      return err({
        kind: "duplicate",
        message: "This repository is already linked to your account.",
      });
    }

    const repoRecordRepo = this.repoRecordRepo();
    try {
      const existingRecord = await repoRecordRepo.findOne({
        where: { githubRepoId },
      });

      await repoRecordRepo.upsert(
        {
          ...(existingRecord?.id ? { id: existingRecord.id } : {}),
          githubRepoId,
          name: ghRepo.name,
          fullName: ghRepo.full_name,
          url: ghRepo.html_url,
          language: ghRepo.language,
          size: ghRepo.size,
          isPrivate: ghRepo.private,
          isFork: ghRepo.fork,
          ownerLogin: ghRepo.owner.login,
          ownerAvatarUrl: ghRepo.owner.avatar_url || null,
          githubUpdatedAt: ghRepo.updated_at ? new Date(ghRepo.updated_at) : null,
          githubPushedAt: ghRepo.pushed_at ? new Date(ghRepo.pushed_at) : null,
          lastIndexedAt: existingRecord?.lastIndexedAt || null,
          needsReindex: hasRepoChanged(
            getRepoChangeTimestamp(ghRepo),
            existingRecord?.lastIndexedAt || null,
          ),
        },
        ["githubRepoId"],
      );

      await linkRepo.insert({ userId, githubRepoId });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Race: another request inserted the same link between our check and insert.
      if (/duplicate key|unique constraint/i.test(message)) {
        return err({
          kind: "duplicate",
          message: "This repository is already linked to your account.",
        });
      }
      return err({ kind: "internal", message: `Failed to link public repo: ${message}` });
    }

    const refreshed = await repoRecordRepo.findOne({ where: { githubRepoId } });
    const lastIndexedAt = refreshed?.lastIndexedAt || null;
    const hasChanges = hasRepoChanged(getRepoChangeTimestamp(ghRepo), lastIndexedAt);

    return ok({
      id: ghRepo.id,
      name: ghRepo.name,
      full_name: ghRepo.full_name,
      html_url: ghRepo.html_url,
      private: ghRepo.private,
      fork: ghRepo.fork,
      language: ghRepo.language,
      size: ghRepo.size,
      owner: ghRepo.owner,
      updated_at: ghRepo.updated_at,
      pushed_at: ghRepo.pushed_at,
      last_indexed_at: lastIndexedAt ? lastIndexedAt.toISOString() : null,
      has_changes: hasChanges,
      needs_reindex: hasChanges || Boolean(refreshed?.needsReindex),
      source: "public",
    });
  }

  async listPublicRepos(
    userId: string,
  ): Promise<Result<PublicRepoListItem[], string>> {
    try {
      const links = await this.linkRepo().find({
        where: { userId },
        order: { createdAt: "DESC" },
      });
      if (links.length === 0) return ok([]);

      const ids = links.map((link) => link.githubRepoId);
      const records = await this.repoRecordRepo().find({
        where: { githubRepoId: In(ids) },
      });
      const byId = new Map(records.map((rec) => [rec.githubRepoId, rec]));

      const items: PublicRepoListItem[] = [];
      for (const link of links) {
        const rec = byId.get(link.githubRepoId);
        if (!rec) continue; // Stale link with no metadata; skip silently.
        const githubUpdatedAt = rec.githubPushedAt || rec.githubUpdatedAt || null;
        const lastIndexedAt = rec.lastIndexedAt || null;
        const hasChanges = hasRepoChanged(githubUpdatedAt, lastIndexedAt);
        items.push({
          id: Number(rec.githubRepoId),
          name: rec.name,
          full_name: rec.fullName,
          html_url: rec.url,
          private: rec.isPrivate,
          fork: rec.isFork,
          language: rec.language,
          size: rec.size,
          owner: {
            login: rec.ownerLogin,
            avatar_url: rec.ownerAvatarUrl || "",
          },
          updated_at: (rec.githubUpdatedAt || new Date()).toISOString(),
          pushed_at: rec.githubPushedAt ? rec.githubPushedAt.toISOString() : null,
          last_indexed_at: lastIndexedAt ? lastIndexedAt.toISOString() : null,
          has_changes: hasChanges,
          needs_reindex: hasChanges || Boolean(rec.needsReindex),
          source: "public",
        });
      }
      return ok(items);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to load public repositories: ${message}`);
    }
  }

  async hasLink(userId: string, githubRepoId: string): Promise<boolean> {
    const count = await this.linkRepo().count({
      where: { userId, githubRepoId },
    });
    return count > 0;
  }

  async removePublicRepo(
    userId: string,
    githubRepoId: string,
  ): Promise<Result<{ removed: boolean }, string>> {
    try {
      const result = await this.linkRepo().delete({ userId, githubRepoId });
      return ok({ removed: Boolean(result.affected) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to remove public repository: ${message}`);
    }
  }
}

export const publicRepoService = new PublicRepoService();

import { In, Repository } from "typeorm";
import { User } from "./user.entity";
import { AppDataSource } from "../../config/datasource";
import { Result, ok, err } from "neverthrow";
import { RepositoryRecord } from "../project/repository.entity";
import { PublicRepoLink } from "../project/public-repo-link.entity";
import { Project } from "../project/project.entity";
import { ReindexJob } from "../reindex/reindex.entity";
import { queryService } from "../query/query.service";
import { deleteObject } from "../../integrations/supabase/supabaseClient";

const STORAGE_BUCKET = "codemap-projects";

export interface GithubRepository {
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

export interface GithubRepositoryWithSyncState extends GithubRepository {
  last_indexed_at: string | null;
  has_changes: boolean;
  needs_reindex: boolean;
}

interface ListGithubReposOptions {
  includeForks?: boolean;
  includeEmpty?: boolean;
}

interface GithubApiRepository {
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

class UserService {
  private getRepoChangeTimestamp(repo: { pushed_at?: string | null; updated_at?: string | null }): Date | null {
    const raw = repo.pushed_at || repo.updated_at || null;
    return raw ? new Date(raw) : null;
  }

  private hasRepoChanged(
    githubUpdatedAt: Date | null,
    lastIndexedAt: Date | null,
  ): boolean {
    if (!githubUpdatedAt || !lastIndexedAt) return false;
    return githubUpdatedAt.getTime() > lastIndexedAt.getTime();
  }

  private getRepo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  private getRepositoryRecordRepo(): Repository<RepositoryRecord> {
    return AppDataSource.getRepository(RepositoryRecord);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(",").map((part) => part.trim());
    const nextLink = links.find((part) => part.endsWith('rel="next"'));
    if (!nextLink) return null;

    const match = nextLink.match(/<([^>]+)>/);
    return match?.[1] || null;
  }

  private async fetchGithubWithRetry(
    url: string,
    accessToken: string,
    maxRetries: number = 3,
  ): Promise<Response> {
    let attempt = 0;

    while (attempt <= maxRetries) {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "CodeMap",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (response.ok) {
        return response;
      }

      const isRateLimited =
        response.status === 429 ||
        (response.status === 403 &&
          response.headers.get("x-ratelimit-remaining") === "0");

      if (isRateLimited && attempt < maxRetries) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : (attempt + 1) * 1000;

        await this.sleep(retryAfterMs);
        attempt += 1;
        continue;
      }

      const errorBody = await response.text();
      throw new Error(
        `GitHub API error ${response.status}: ${errorBody || response.statusText}`,
      );
    }

    throw new Error("GitHub API request failed after retries");
  }

  private async syncGithubRepositories(
    repositories: GithubRepository[],
  ): Promise<void> {
    if (repositories.length === 0) return;

    const repositoryRecordRepo = this.getRepositoryRecordRepo();
    const githubRepoIds = repositories.map((repo) => String(repo.id));
    const existingRecords = await repositoryRecordRepo.find({
      where: {
        githubRepoId: In(githubRepoIds),
      },
    });
    const existingByGithubId = new Map(
      existingRecords.map((record) => [record.githubRepoId, record]),
    );

    await repositoryRecordRepo.upsert(
      repositories.map((repo) => ({
        ...(existingByGithubId.get(String(repo.id))?.id
          ? { id: existingByGithubId.get(String(repo.id))?.id }
          : {}),
        githubRepoId: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        language: repo.language,
        size: repo.size,
        isPrivate: repo.private,
        isFork: repo.fork,
        ownerLogin: repo.owner.login,
        ownerAvatarUrl: repo.owner.avatar_url || null,
        githubUpdatedAt: repo.updated_at ? new Date(repo.updated_at) : null,
        githubPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
        lastIndexedAt:
          existingByGithubId.get(String(repo.id))?.lastIndexedAt || null,
        needsReindex: this.hasRepoChanged(
          this.getRepoChangeTimestamp(repo),
          existingByGithubId.get(String(repo.id))?.lastIndexedAt || null,
        ),
      })),
      ["githubRepoId"],
    );
  }

  async createUser(userData: Partial<User>): Promise<Result<User, string>> {
    try {
      const repo = this.getRepo();
      const user = repo.create(userData);
      const saved = await repo.save(user);
      return ok(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to create user: ${message}`);
    }
  }

  async getProfile(userId: string): Promise<
    Result<
      {
        id: string;
        username: string;
        email: string;
        authProvider: string;
        avatarUrl: string | null;
        isGuest: boolean;
        githubConnected: boolean;
        googleConnected: boolean;
      },
      string
    >
  > {
    try {
      const repo = this.getRepo();
      const user = await repo.findOne({ where: { id: userId } });

      if (!user) {
        return err("User not found");
      }

      return ok({
        id: user.id,
        username: user.username,
        email: user.email,
        authProvider: user.authProvider,
        avatarUrl: user.avatarUrl,
        isGuest: user.isGuest,
        githubConnected: Boolean(user.githubId),
        googleConnected: Boolean(user.googleId),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to fetch user profile: ${message}`);
    }
  }

  async deleteUser(userId: string): Promise<Result<void, string>> {
    try {
      const repo = this.getRepo();
      const result = await repo.delete({ id: userId });

      if (!result.affected) {
        return err("User not found");
      }

      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to delete user: ${message}`);
    }
  }

  async deleteUserAccount(
    userId: string,
  ): Promise<Result<{ warnings: string[] }, string>> {
    const warnings: string[] = [];
    console.info(`[accountDelete] start userId=${userId}`);
    console.info("[accountDelete] cascade delete not configured; running explicit cleanup");

    try {
      const userRepo = this.getRepo();
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) {
        return err("User not found");
      }

      const projectRepo = AppDataSource.getRepository(Project);
      const repoRecordRepo = this.getRepositoryRecordRepo();
      const reindexJobRepo = AppDataSource.getRepository(ReindexJob);

      const projects = await projectRepo.find();
      const repoRecords = await repoRecordRepo.find();

      console.info(
        `[accountDelete] targets projects=${projects.length} repos=${repoRecords.length}`,
      );

      const projectIdsFromUploads = projects.map((project) => project.id);
      const vectorProjectIds = new Set<string>();

      for (const projectId of projectIdsFromUploads) {
        vectorProjectIds.add(projectId);
      }
      for (const record of repoRecords) {
        vectorProjectIds.add(`gh_${record.githubRepoId}`);
      }

      if (vectorProjectIds.size > 0) {
        console.info(
          `[accountDelete] deleting vectors for ${vectorProjectIds.size} projects`,
        );
        for (const projectId of vectorProjectIds) {
          const deleteResult = await queryService.deleteProjectVectors(projectId);
          if (deleteResult.isErr()) {
            const message = `Failed to delete vectors for ${projectId}: ${deleteResult.error}`;
            console.warn(`[accountDelete] ${message}`);
            warnings.push(message);
          }
        }
      }

      for (const project of projects) {
        if (!project.zipStoragePath) continue;
        try {
          await deleteObject(STORAGE_BUCKET, project.zipStoragePath);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const warning = `Failed to delete storage object ${project.zipStoragePath}: ${message}`;
          console.warn(`[accountDelete] ${warning}`);
          warnings.push(warning);
        }
      }

      if (projectIdsFromUploads.length > 0) {
        await projectRepo.delete({ id: In(projectIdsFromUploads) });
      }

      if (repoRecords.length > 0) {
        await repoRecordRepo.delete({ id: In(repoRecords.map((record) => record.id)) });
      }

      await reindexJobRepo.delete({ userId });

      try {
        await AppDataSource.getRepository(PublicRepoLink).delete({ userId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(
          `[accountDelete] Failed to delete public-repo links for user ${userId}: ${message}`,
        );
        warnings.push(`Failed to delete public-repo links: ${message}`);
      }

      const deleteResult = await userRepo.delete({ id: userId });
      if (!deleteResult.affected) {
        return err("Failed to delete user record");
      }

      console.info(
        `[accountDelete] completed userId=${userId} warnings=${warnings.length}`,
      );
      return ok({ warnings });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[accountDelete] failed userId=${userId}: ${message}`);
      return err(`Failed to delete account: ${message}`);
    }
  }

  async listGithubRepos(
    userId: string,
    options: ListGithubReposOptions = {},
  ): Promise<Result<GithubRepositoryWithSyncState[], string>> {
    try {
      const repo = this.getRepo();
      const user = await repo.findOne({ where: { id: userId } });

      if (!user) {
        return err("User not found");
      }

      if (!user.githubAccessToken) {
        return err(
          "GitHub account not connected. Please authenticate with GitHub.",
        );
      }

      const includeForks = options.includeForks ?? false;
      const includeEmpty = options.includeEmpty ?? false;

      const collected: GithubRepository[] = [];
      let nextPageUrl: string | null =
        "https://api.github.com/user/repos?per_page=100&page=1&sort=updated";

      while (nextPageUrl) {
        const response = await this.fetchGithubWithRetry(
          nextPageUrl,
          user.githubAccessToken,
        );

        const pageRepos = (await response.json()) as GithubApiRepository[];
        const filtered = pageRepos.filter((ghRepo) => {
          if (!includeForks && ghRepo.fork) return false;
          if (!includeEmpty && ghRepo.size === 0) return false;
          return true;
        });

        collected.push(...filtered);
        nextPageUrl = this.getNextPageUrl(response.headers.get("link"));
      }

      await this.syncGithubRepositories(collected);

      const repositoryRecordRepo = this.getRepositoryRecordRepo();
      const githubRepoIds = collected.map((repoItem) => String(repoItem.id));

      const storedRecords = await repositoryRecordRepo.find({
        where: {
          githubRepoId: In(githubRepoIds),
        },
      });

      const storedByGithubId = new Map(
        storedRecords.map((record) => [record.githubRepoId, record]),
      );

      const repositoriesWithState = collected.map((repoItem) => {
        const stored = storedByGithubId.get(String(repoItem.id));
        const githubUpdatedAt = this.getRepoChangeTimestamp(repoItem);
        const lastIndexedAt = stored?.lastIndexedAt || null;
        const hasChanges = this.hasRepoChanged(githubUpdatedAt, lastIndexedAt);

        return {
          ...repoItem,
          last_indexed_at: lastIndexedAt ? lastIndexedAt.toISOString() : null,
          has_changes: hasChanges,
          needs_reindex: hasChanges || Boolean(stored?.needsReindex),
        };
      });

      return ok(repositoriesWithState);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to fetch GitHub repositories: ${message}`);
    }
  }
}

export const userService = new UserService();

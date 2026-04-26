import { In, Repository } from "typeorm";
import { User } from "./user.entity";
import { AppDataSource } from "../../config/datasource";
import { Result, ok, err } from "neverthrow";
import { RepositoryRecord } from "../project/repository.entity";

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
}

class UserService {
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
        lastIndexedAt:
          existingByGithubId.get(String(repo.id))?.lastIndexedAt || null,
        needsReindex: this.hasRepoChanged(
          repo.updated_at ? new Date(repo.updated_at) : null,
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
        const githubUpdatedAt = repoItem.updated_at
          ? new Date(repoItem.updated_at)
          : null;
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

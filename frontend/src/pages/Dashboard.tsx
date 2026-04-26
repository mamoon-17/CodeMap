import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Clock,
  Check,
  Loader2,
  X,
  Upload,
  Github,
  RefreshCw,
  LogOut,
} from "lucide-react";
import type { ProjectContextItem, UserProfile } from "@/types/api";
import { getReindexStatus, startReindex } from "@/services/api";

interface Repo {
  id: string;
  name: string;
  status: "indexed" | "processing" | "available";
  lastUpdated: string;
  lastIndexedAt: string | null;
  hasChanges: boolean;
  needsReindex: boolean;
  files: number;
  language?: string;
  size?: number;
  source: "github" | "upload";
}

type ReindexUiState =
  | {
      status: "idle";
    }
  | {
      status: "running";
      jobId: string;
      lastStep?: string;
      lastMessage?: string;
    }
  | {
      status: "completed";
      jobId: string;
      indexedChunks: number;
      skippedFilesCount: number;
      skippedFiles: Array<{ file: string; reason: string }> | null;
    }
  | {
      status: "failed";
      jobId: string;
      error: string;
      lastStep?: string;
    };

interface GithubRepoResponse {
  id: number;
  full_name: string;
  language: string | null;
  size: number;
  updated_at: string;
  pushed_at: string | null;
  last_indexed_at: string | null;
  has_changes: boolean;
  needs_reindex: boolean;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const ACTIVE_PROJECT_ID_KEY = "activeProjectId";
const ACTIVE_PROJECT_NAME_KEY = "activeProjectName";
const PROJECT_CONTEXTS_KEY = "projectContexts";

function mapStatus(
  backendStatus: string,
): "indexed" | "processing" | "available" {
  if (backendStatus === "ready") return "indexed";
  if (backendStatus === "indexing") return "processing";
  return "processing";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [reindexingRepoId, setReindexingRepoId] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string>("");
  const [reindexUiByRepo, setReindexUiByRepo] = useState<
    Record<string, ReindexUiState>
  >({});
  const [expandedSkipsRepoId, setExpandedSkipsRepoId] = useState<string | null>(
    null,
  );
  const [activeProjectId, setActiveProjectId] = useState(
    localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "",
  );
  const [activeProjectName, setActiveProjectName] = useState(
    localStorage.getItem(ACTIVE_PROJECT_NAME_KEY) || "",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveProjectContext = (project: ProjectContextItem) => {
    const raw = localStorage.getItem(PROJECT_CONTEXTS_KEY);
    const existing = raw ? (JSON.parse(raw) as ProjectContextItem[]) : [];
    const deduped = [project, ...existing.filter((p) => p.id !== project.id)];
    localStorage.setItem(
      PROJECT_CONTEXTS_KEY,
      JSON.stringify(deduped.slice(0, 50)),
    );
  };

  const setActiveProject = (
    projectId: string,
    projectName: string,
    source: "github" | "upload",
  ) => {
    setActiveProjectId(projectId);
    setActiveProjectName(projectName);
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, projectId);
    localStorage.setItem(ACTIVE_PROJECT_NAME_KEY, projectName);
    saveProjectContext({ id: projectId, name: projectName, source });
  };

  const startOAuth = (provider: "google" | "github") => {
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  const authHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined;
  };

  const loadProfileAndRepos = async () => {
    setReposLoading(true);
    setProfileLoading(true);
    setReposError("");

    try {
      const headers = authHeaders();
      if (!headers) {
        throw new Error("Please login to load repositories.");
      }

      const profileResponse = await fetch(`${API_BASE_URL}/users/me`, {
        headers,
      });
      const profilePayload = await profileResponse.json();
      if (profileResponse.ok) {
        setCurrentUser(profilePayload.data as UserProfile);
      }

      const response = await fetch(`${API_BASE_URL}/users/repos`, {
        headers,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load repositories");
      }

      const githubRepos = (payload.data?.repositories || []) as GithubRepoResponse[];

      setRepos(
        githubRepos.map((repo) => ({
          id: `gh_${String(repo.id)}`,
          name: repo.full_name,
          status: "available",
          lastUpdated: timeAgo(repo.pushed_at || repo.updated_at),
          lastIndexedAt: repo.last_indexed_at,
          hasChanges: repo.has_changes,
          needsReindex: repo.needs_reindex,
          files: 0,
          language: repo.language || "Unknown",
          size: repo.size,
          source: "github",
        })),
      );
    } catch (error) {
      setReposError(
        error instanceof Error ? error.message : "Failed to load repositories",
      );
    } finally {
      setReposLoading(false);
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    void loadProfileAndRepos();
  }, []);

  const handleReindexFullRepo = async (repoId: string) => {
    const token = localStorage.getItem("accessToken") || "";
    if (!token) {
      setReindexError("Please login to re-index repositories.");
      return;
    }

    setReindexError("");
    setReindexingRepoId(repoId);
    setReindexUiByRepo((prev) => ({
      ...prev,
      [repoId]: { status: "running", jobId: "" },
    }));

    try {
      const start = await startReindex(token, { repo_id: repoId });
      const jobId = start.data?.job_id;
      if (!jobId) throw new Error("Reindex job did not return a job_id");

      setReindexUiByRepo((prev) => ({
        ...prev,
        [repoId]: { status: "running", jobId },
      }));

      // Poll job status until terminal state.
      for (let i = 0; i < 180; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const status = await getReindexStatus(token, jobId);
        const st = status.data?.status;
        const lastStep = status.data?.last_step;
        const logs = status.data?.logs || null;
        const lastMessage =
          logs && logs.length > 0 ? logs[logs.length - 1]?.message : undefined;

        setReindexUiByRepo((prev) => ({
          ...prev,
          [repoId]: {
            status: "running",
            jobId,
            lastStep,
            lastMessage,
          },
        }));
        if (st === "completed") break;
        if (st === "failed") {
          throw new Error(status.data?.error || "Reindex failed");
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 2000));
      }

      const finalStatus = await getReindexStatus(token, jobId);
      if (finalStatus.data?.status !== "completed") {
        throw new Error(finalStatus.data?.error || "Reindex failed");
      }

      setReindexUiByRepo((prev) => ({
        ...prev,
        [repoId]: {
          status: "completed",
          jobId,
          indexedChunks: finalStatus.data?.indexed_chunks ?? 0,
          skippedFilesCount: finalStatus.data?.skipped_files_count ?? 0,
          skippedFiles: finalStatus.data?.skipped_files ?? null,
        },
      }));

      await loadProfileAndRepos();
    } catch (e) {
      setReindexError(e instanceof Error ? e.message : "Reindex failed");
      const jobId =
        reindexUiByRepo[repoId] && "jobId" in reindexUiByRepo[repoId]
          ? (reindexUiByRepo[repoId] as any).jobId
          : "";
      setReindexUiByRepo((prev) => ({
        ...prev,
        [repoId]: {
          status: "failed",
          jobId,
          error: e instanceof Error ? e.message : "Reindex failed",
        },
      }));
    } finally {
      setReindexingRepoId(null);
    }
  };

  const handleAddRepo = async () => {
    if (zipFile) {
      // Handle ZIP upload
      setUploadStatus("uploading");
      setUploadError("");
      const formData = new FormData();
      formData.append("file", zipFile);
      formData.append("name", zipFile.name.replace(".zip", ""));

      // Add a processing card immediately so the user sees the loader
      const tempId = `temp-${Date.now()}`;
      const projectName = zipFile.name.replace(".zip", "");
      setRepos((prev) => [
        ...prev,
        {
          id: tempId,
          name: projectName,
          status: "processing",
          lastUpdated: "Just now",
          lastIndexedAt: null,
          hasChanges: false,
          needsReindex: false,
          files: 0,
        },
      ]);
      setZipFile(null);
      setShowAddModal(false);

      try {
        const res = await fetch(`${API_BASE_URL}/projects/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        // Replace the temp card with the real project data
        setRepos((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? {
                  id: data.project.id,
                  name: data.project.name,
                  status: mapStatus(data.project.status),
                  lastUpdated: "Just now",
                  lastIndexedAt: new Date().toISOString(),
                  hasChanges: false,
                  needsReindex: false,
                  files: data.fileCount ?? 0,
                  source: "upload",
                }
              : r,
          ),
        );
        setActiveProject(data.project.id, data.project.name, "upload");
        setUploadStatus("idle");
      } catch (e) {
        // Remove the temp card on failure and reopen modal with error
        setRepos((prev) => prev.filter((r) => r.id !== tempId));
        setUploadError(e instanceof Error ? e.message : "Upload failed");
        setUploadStatus("error");
        setShowAddModal(true);
      }
      return;
    }
    if (!repoUrl.trim()) return;
    const name = repoUrl.replace("https://github.com/", "").replace(".git", "");
    setRepos((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: name || "new/repository",
        status: "processing",
        lastUpdated: "Just now",
        lastIndexedAt: null,
        hasChanges: false,
        needsReindex: false,
        files: 0,
        source: "github",
      },
    ]);
    setRepoUrl("");
    setShowAddModal(false);
  };

  const handleConnectRepo = (repoId: string) => {
    const selectedRepo = repos.find((repo) => repo.id === repoId);
    if (!selectedRepo) return;

    setActiveProject(selectedRepo.id, selectedRepo.name, selectedRepo.source);
    navigate("/query");
  };

  const initialLetter = (
    currentUser?.username?.trim()?.charAt(0) ||
    currentUser?.email?.trim()?.charAt(0) ||
    "U"
  ).toUpperCase();

  const providerLabel = currentUser?.authProvider
    ? currentUser.authProvider.charAt(0).toUpperCase() +
      currentUser.authProvider.slice(1)
    : "Unknown";

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold text-primary-foreground font-mono">
                &lt;/&gt;
              </span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              CodeMap
            </span>
          </Link>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
            >
              <span className="text-sm text-muted-foreground hidden sm:block">
                {profileLoading
                  ? "Loading user..."
                  : currentUser?.email || "Unknown user"}
              </span>
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt="User avatar"
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-medium text-primary">
                    {initialLetter}
                  </span>
                )}
              </div>
            </button>

            {showDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-48 rounded-md border bg-card shadow-lg z-50 animate-fade-in">
                  <div className="py-1">
                    <div className="px-3 py-2 border-b border-border/70">
                      <p className="text-sm font-medium text-foreground truncate">
                        {currentUser?.username || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {currentUser?.email || "No email"}
                      </p>
                      <div className="mt-1 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        Provider: {providerLabel}
                      </div>
                    </div>
                    {currentUser?.authProvider === "github" && (
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                        onClick={() => startOAuth("github")}
                      >
                        <RefreshCw size={15} />
                        Reconnect GitHub
                      </button>
                    )}
                    {currentUser?.authProvider === "google" && (
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                        onClick={() => startOAuth("google")}
                      >
                        <RefreshCw size={15} />
                        Reconnect Google
                      </button>
                    )}
                    <div className="my-1 h-px bg-border" />
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-secondary transition-colors"
                      onClick={() => {
                        localStorage.removeItem("accessToken");
                        setShowDropdown(false);
                        navigate("/login");
                      }}
                    >
                      <LogOut size={15} />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Repositories
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {repos.length} repositories connected
            </p>
            {activeProjectId && (
              <p className="text-xs text-muted-foreground mt-1">
                Active project: {activeProjectName || activeProjectId}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} />
            Add Repository
          </button>
        </div>

        {/* Repo Grid */}
        {reposLoading && (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading repositories...
          </div>
        )}

        {!reposLoading && reposError && (
          <div className="rounded-lg border border-destructive/40 bg-card p-6">
            <p className="text-sm text-destructive">{reposError}</p>
          </div>
        )}

        {!reposLoading && !reposError && repos.length === 0 && (
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              No repositories found. Connect your GitHub account and try again.
            </p>
          </div>
        )}

        {!reposLoading && !reposError && repos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="rounded-lg border bg-card p-4 shadow-subtle transition-shadow hover:shadow-card"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground font-mono">
                      {repo.name}
                    </h3>
                    <div className="mt-2 flex items-center gap-3">
                      {repo.status === "indexed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check size={12} />
                          Indexed
                        </span>
                      ) : repo.status === "processing" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warning">
                          <Loader2 size={12} className="animate-spin" />
                          Processing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Github size={12} />
                          From GitHub
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={12} />
                        {repo.lastUpdated}
                      </span>
                    </div>
                    {repo.files > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {repo.files} files
                      </p>
                    )}
                    {(repo.language || typeof repo.size === "number") && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {repo.language ? repo.language : "Unknown"}
                        {typeof repo.size === "number"
                          ? ` • ${repo.size} KB`
                          : ""}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last indexed:{" "}
                      {repo.lastIndexedAt
                        ? timeAgo(repo.lastIndexedAt)
                        : "Not indexed"}
                    </p>
                    {repo.needsReindex && (
                      <p className="mt-1 text-xs text-warning">
                        Repository changed on GitHub. Re-index required.
                      </p>
                    )}
                  </div>
                </div>
                {repo.status === "processing" && (
                  <div className="mt-3">
                    <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full w-2/3 rounded-full bg-warning animate-pulse-subtle" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Indexing repository…
                    </p>
                  </div>
                )}
                {repo.status === "indexed" && (
                  <div className="mt-4">
                    <Link
                      to="/query"
                      className="inline-flex w-full items-center justify-center rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Open
                    </Link>
                  </div>
                )}
                {repo.status === "available" && (
                  <div className="mt-4">
                    {repo.source === "github" && (
                      <button
                        onClick={() => handleReindexFullRepo(repo.id)}
                        disabled={reindexingRepoId === repo.id}
                        className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                        title={
                          repo.lastIndexedAt ? "Re-index full repository" : "Index full repository"
                        }
                      >
                        {reindexingRepoId === repo.id ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            {repo.lastIndexedAt ? "Re-indexing…" : "Indexing…"}
                          </>
                        ) : (
                          <>
                            <RefreshCw size={14} />
                            {repo.lastIndexedAt ? "Re-index" : "Index"}
                          </>
                        )}
                      </button>
                    )}

                    {repo.source === "github" &&
                      reindexUiByRepo[repo.id]?.status === "running" && (
                        <div className="mb-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="truncate">
                              {(reindexUiByRepo[repo.id] as any).lastStep
                                ? `Step: ${(reindexUiByRepo[repo.id] as any).lastStep}`
                                : "Indexing…"}
                            </span>
                          </div>
                          {(reindexUiByRepo[repo.id] as any).lastMessage && (
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
                              {(reindexUiByRepo[repo.id] as any).lastMessage}
                            </p>
                          )}
                        </div>
                      )}

                    {repo.source === "github" &&
                      reindexUiByRepo[repo.id]?.status === "completed" && (
                        <div className="mb-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              Indexed chunks:{" "}
                              {(reindexUiByRepo[repo.id] as any).indexedChunks}
                            </span>
                            <button
                              type="button"
                              className="text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                              onClick={() =>
                                setExpandedSkipsRepoId((prev) =>
                                  prev === repo.id ? null : repo.id,
                                )
                              }
                            >
                              Skipped:{" "}
                              {(reindexUiByRepo[repo.id] as any)
                                .skippedFilesCount ?? 0}
                            </button>
                          </div>
                          {expandedSkipsRepoId === repo.id && (
                            <div className="mt-2 space-y-1">
                              {(
                                (reindexUiByRepo[repo.id] as any)
                                  .skippedFiles || []
                              ).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No skipped-file details (or none skipped).
                                </p>
                              ) : (
                                <ul className="max-h-28 overflow-auto space-y-1 pr-1">
                                  {(
                                    (reindexUiByRepo[repo.id] as any)
                                      .skippedFiles as Array<{
                                      file: string;
                                      reason: string;
                                    }>
                                  ).map((s) => (
                                    <li key={s.file} className="font-mono">
                                      {s.file}{" "}
                                      <span className="text-muted-foreground">
                                        ({s.reason})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                    {repo.source === "github" &&
                      reindexUiByRepo[repo.id]?.status === "failed" && (
                        <div className="mb-2 rounded-md border border-destructive/40 bg-card px-3 py-2 text-xs text-destructive">
                          Re-index failed:{" "}
                          {(reindexUiByRepo[repo.id] as any).error}
                        </div>
                      )}
                    <button
                      onClick={() => handleConnectRepo(repo.id)}
                      disabled={reindexingRepoId === repo.id}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Github size={14} />
                      {activeProjectId === repo.id
                        ? "Selected"
                        : "Use in Query"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!reposLoading && !reposError && reindexError && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-card p-4">
            <p className="text-sm text-destructive">{reindexError}</p>
          </div>
        )}
      </div>

      {/* Add Repo Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-foreground/20"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-elevated animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">
                Add Repository
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  GitHub Repository URL
                </label>
                <div className="relative">
                  <Github
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  setZipFile(e.target.files?.[0] ?? null);
                  setUploadError("");
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed bg-background py-6 text-sm transition-colors hover:border-primary hover:text-foreground ${
                  zipFile
                    ? "border-primary text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Upload size={16} />
                {zipFile ? zipFile.name : "Upload ZIP file"}
              </button>

              {uploadError && (
                <p className="text-xs text-destructive">{uploadError}</p>
              )}

              <button
                onClick={handleAddRepo}
                disabled={uploadStatus === "uploading"}
                className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {uploadStatus === "uploading"
                  ? "Uploading..."
                  : "Add Repository"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

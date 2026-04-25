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
  User,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";

interface Repo {
  id: string;
  name: string;
  status: "indexed" | "processing" | "available";
  lastUpdated: string;
  files: number;
  language?: string;
  size?: number;
}

interface GithubRepoResponse {
  id: number;
  full_name: string;
  language: string | null;
  size: number;
  updated_at: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadRepos = async () => {
      setReposLoading(true);
      setReposError("");

      try {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          throw new Error("Please login to load repositories.");
        }

        const response = await fetch(`${API_BASE_URL}/users/repos`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load repositories");
        }

        const githubRepos = (payload.data?.repositories || []) as GithubRepoResponse[];

        setRepos(
          githubRepos.map((repo) => ({
            id: String(repo.id),
            name: repo.full_name,
            status: "available",
            lastUpdated: timeAgo(repo.updated_at),
            files: 0,
            language: repo.language || "Unknown",
            size: repo.size,
          })),
        );
      } catch (error) {
        setReposError(
          error instanceof Error ? error.message : "Failed to load repositories",
        );
      } finally {
        setReposLoading(false);
      }
    };

    void loadRepos();
  }, []);

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
                  files: data.fileCount ?? 0,
                }
              : r,
          ),
        );
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
        files: 0,
      },
    ]);
    setRepoUrl("");
    setShowAddModal(false);
  };

  const handleConnectRepo = (repoId: string) => {
    setRepos((prev) =>
      prev.map((repo) =>
        repo.id === repoId
          ? { ...repo, status: "processing", lastUpdated: "Just now" }
          : repo,
      ),
    );
  };

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
                developer@acme.dev
              </span>
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium text-primary">D</span>
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
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                      onClick={() => setShowDropdown(false)}
                    >
                      <User size={15} />
                      View Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                      onClick={() => setShowDropdown(false)}
                    >
                      <SettingsIcon size={15} />
                      Settings
                    </Link>
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
                      {typeof repo.size === "number" ? ` • ${repo.size} KB` : ""}
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
                  <button
                    onClick={() => handleConnectRepo(repo.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Github size={14} />
                    Connect
                  </button>
                </div>
              )}
            </div>
            ))}
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

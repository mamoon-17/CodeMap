import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { deleteAccount } from "@/services/api";

const SETTINGS_KEYS = {
  pushNotifications: "settings.pushNotifications",
  emailUpdates: "settings.emailUpdates",
  theme: "settings.theme",
  saveHistory: "settings.saveHistory",
};

type ThemeOption = "light" | "dark" | "system";

const readBool = (key: string, fallback: boolean) => {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
};

const readTheme = (): ThemeOption => {
  const raw = localStorage.getItem(SETTINGS_KEYS.theme);
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
};

const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
      checked
        ? "bg-primary border-primary"
        : "bg-secondary border-border"
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
        checked ? "translate-x-5" : "translate-x-1"
      }`}
    />
  </button>
);

const Settings = () => {
  const navigate = useNavigate();
  const [pushNotifications, setPushNotifications] = useState(() =>
    readBool(SETTINGS_KEYS.pushNotifications, true),
  );
  const [emailUpdates, setEmailUpdates] = useState(() =>
    readBool(SETTINGS_KEYS.emailUpdates, false),
  );
  const [saveHistory, setSaveHistory] = useState(() =>
    readBool(SETTINGS_KEYS.saveHistory, true),
  );
  const [theme, setTheme] = useState<ThemeOption>(readTheme);
  const [clearStatus, setClearStatus] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEYS.pushNotifications,
      String(pushNotifications),
    );
  }, [pushNotifications]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEYS.emailUpdates, String(emailUpdates));
  }, [emailUpdates]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEYS.saveHistory, String(saveHistory));
  }, [saveHistory]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEYS.theme, theme);
  }, [theme]);

  const handleClearHistory = () => {
    localStorage.removeItem("queryHistory");
    localStorage.removeItem("queryMessages");
    setClearStatus("Query history cleared.");
    window.setTimeout(() => setClearStatus(""), 2500);
  };

  const handleDeleteAccount = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setDeleteError("You are not logged in.");
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteAccount(token);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      navigate("/login", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete account.",
      );
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold text-primary-foreground font-mono">
                &lt;/&gt;
              </span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              CodeMap
            </span>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your preferences
          </p>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Notifications
            </h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Push notifications
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Get notified when indexing completes
                  </p>
                </div>
                <Toggle
                  checked={pushNotifications}
                  onChange={setPushNotifications}
                  label="Push notifications"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Email updates
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receive weekly usage summaries
                  </p>
                </div>
                <Toggle
                  checked={emailUpdates}
                  onChange={setEmailUpdates}
                  label="Email updates"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
            <p className="mt-1 text-xs text-muted-foreground">Theme</p>
            <div className="mt-4 flex gap-3">
              {(["light", "dark", "system"] as ThemeOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    theme === option
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Privacy</h2>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Save query history
                </p>
                <p className="text-xs text-muted-foreground">
                  Store your searches for quick access
                </p>
              </div>
              <Toggle
                checked={saveHistory}
                onChange={setSaveHistory}
                label="Save query history"
              />
            </div>
          </section>

          <section className="rounded-lg border border-destructive/30 bg-card p-5">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} />
              <h2 className="text-sm font-semibold">Danger Zone</h2>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Clear all query history
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Remove locally saved searches
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Clear all query history
                </button>
              </div>
              {clearStatus && (
                <p className="text-xs text-muted-foreground">{clearStatus}</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Delete account
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This will permanently delete your account and data
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  Delete account
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-foreground/20"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-elevated animate-fade-in">
            <h3 className="text-base font-semibold text-foreground">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This action is irreversible. All associated data will be removed.
            </p>
            {deleteError && (
              <p className="mt-3 text-xs text-destructive">{deleteError}</p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

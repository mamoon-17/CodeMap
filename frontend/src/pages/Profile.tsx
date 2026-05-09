import { useEffect, useState } from "react";
import { ArrowLeft, Mail, User, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import type { UserProfile } from "@/types/api";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Please login to view your profile.");
      setIsLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load profile");
        }

        setProfile(payload.data as UserProfile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const providerLabel = profile?.authProvider
    ? profile.authProvider.charAt(0).toUpperCase() +
      profile.authProvider.slice(1)
    : "Unknown";

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
          <h1 className="text-2xl font-semibold text-foreground">
            Your Profile
          </h1>
          <p className="text-sm text-muted-foreground">
            Account details and connected providers
          </p>
        </div>

        {isLoading && (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Loading profile...
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg border border-destructive/40 bg-card p-6">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!isLoading && !error && profile && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt="User avatar"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-primary">
                      {(profile.username || profile.email || "U")
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {profile.username || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed in with {providerLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User size={14} />
                  <span className="text-xs uppercase tracking-wider">
                    Username
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {profile.username || "Unknown"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail size={14} />
                  <span className="text-xs uppercase tracking-wider">Email</span>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {profile.email || "No email"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield size={14} />
                <span className="text-xs uppercase tracking-wider">
                  Connected Providers
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-sm text-foreground">Google</span>
                  <span
                    className={`text-xs font-medium ${
                      profile.googleConnected
                        ? "text-success"
                        : "text-muted-foreground"
                    }`}
                  >
                    {profile.googleConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-sm text-foreground">GitHub</span>
                  <span
                    className={`text-xs font-medium ${
                      profile.githubConnected
                        ? "text-success"
                        : "text-muted-foreground"
                    }`}
                  >
                    {profile.githubConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;

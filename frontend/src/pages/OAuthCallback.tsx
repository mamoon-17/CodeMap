import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );

  useEffect(() => {
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const oauthError = params.get("error");

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!accessToken) {
      setError("OAuth login failed: missing access token");
      return;
    }

    localStorage.setItem("accessToken", accessToken);

    if (refreshToken) {
      localStorage.setItem("refreshToken", refreshToken);
    }

    navigate("/dashboard", { replace: true });
  }, [navigate, params]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">OAuth Login Failed</h1>
          <p className="mt-3 text-sm text-destructive">{error}</p>
          <Link
            to="/login"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">Completing OAuth login...</p>
    </div>
  );
};

export default OAuthCallback;

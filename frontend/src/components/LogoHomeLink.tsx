import { Link } from "react-router-dom";

interface LogoHomeLinkProps {
  className?: string;
}

const getLogoDestination = () => {
  if (typeof window === "undefined") return "/";
  return window.localStorage.getItem("accessToken") ? "/dashboard" : "/";
};

export const LogoHomeLink = ({ className }: LogoHomeLinkProps) => (
  <Link
    to={getLogoDestination()}
    className={className || "flex items-center gap-2.5"}
    aria-label="Go to CodeMap home"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
      <span className="text-xs font-bold text-primary-foreground font-mono">
        &lt;/&gt;
      </span>
    </div>
    <span className="text-lg font-semibold tracking-tight text-foreground">
      CodeMap
    </span>
  </Link>
);

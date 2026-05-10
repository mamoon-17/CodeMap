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
    <img
      src="/codemap.svg"
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-lg"
    />
    <span className="text-lg font-semibold tracking-tight text-foreground">
      CodeMap
    </span>
  </Link>
);

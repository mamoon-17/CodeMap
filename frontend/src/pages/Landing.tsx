import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  MessageSquare,
  FileCode,
  ArrowRight,
  Terminal,
} from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Semantic Code Search",
    description:
      "Search across your entire codebase using natural language. Find implementations, patterns, and logic without knowing exact file paths.",
  },
  {
    icon: MessageSquare,
    title: "AI-Powered Explanations",
    description:
      "Get clear, contextual explanations of how code works. Understand complex logic, dependencies, and architectural decisions.",
  },
  {
    icon: FileCode,
    title: "File-Level Source Referencing",
    description:
      "Every answer links back to exact files and line numbers. Verify AI explanations against the actual source code instantly.",
  },
];

/* ── Typing-animation pieces ── */
const AI_PREFIX = "Authentication is handled in ";
const AI_CODE = "src/auth/";
const AI_SUFFIX = " using JWT tokens with middleware verification.";

const FULL_PARTS = [
  { text: AI_PREFIX, type: "plain" as const },
  { text: AI_CODE, type: "code" as const },
  { text: AI_SUFFIX, type: "plain" as const },
];

const CHAR_DELAY = 28; // ms per character
const CODE_REF_DELAY = 350; // ms after typing finishes

const Landing = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [charIndex, setCharIndex] = useState(0);
  const [showCodeRef, setShowCodeRef] = useState(false);

  const totalChars = FULL_PARTS.reduce((n, p) => n + p.text.length, 0);

  /* Start animation when the terminal preview scrolls into view */
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Character-by-character typing */
  useEffect(() => {
    if (!hasStarted || charIndex >= totalChars) return;
    const id = setTimeout(() => setCharIndex((i) => i + 1), CHAR_DELAY);
    return () => clearTimeout(id);
  }, [hasStarted, charIndex, totalChars]);

  /* Show the code-ref block after typing completes */
  useEffect(() => {
    if (charIndex < totalChars) return;
    const id = setTimeout(() => setShowCodeRef(true), CODE_REF_DELAY);
    return () => clearTimeout(id);
  }, [charIndex, totalChars]);

  /* Build visible text fragments up to charIndex */
  const visibleParts = useCallback(() => {
    let remaining = charIndex;
    return FULL_PARTS.map((part) => {
      if (remaining <= 0) return { ...part, text: "" };
      const slice = part.text.slice(0, remaining);
      remaining -= slice.length;
      return { ...part, text: slice };
    });
  }, [charIndex]);

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
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-14">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Terminal size={12} />
            Built for engineering teams
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl leading-[1.15]">
            Understand any codebase,
            <br />
            <span className="text-primary">without reading every file.</span>
          </h1>
          <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-lg">
            Ask plain-language questions about your repository and get precise,
            source-referenced explanations in seconds.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Connect Repository
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/query"
              className="inline-flex items-center rounded-md border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Try Demo
            </Link>
          </div>
        </div>

        {/* Terminal preview */}
        <div
          ref={terminalRef}
          className="mt-16 overflow-hidden rounded-lg border bg-card shadow-[0_8px_12px_rgba(0,0,0,0.15)]"
        >
          <div className="flex items-center gap-1.5 border-b px-4 py-2.5 bg-muted/30">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-400/50" />
            <span className="ml-3 text-xs text-muted-foreground font-mono">
              codemap — query
            </span>
          </div>
          <div className="p-6 space-y-5">
            <div className="flex gap-3">
              <span className="text-xs text-muted-foreground font-mono mt-1 shrink-0 w-6 text-right">
                YOU
              </span>
              <div className="rounded-md bg-secondary/70 px-3.5 py-2 text-sm text-foreground">
                Where is authentication implemented?
              </div>
            </div>
            {hasStarted && (
              <div className="flex gap-3">
                <span className="text-xs text-primary font-mono mt-1 font-medium shrink-0 w-6 text-right">
                  AI
                </span>
                <div className="space-y-2 text-sm text-foreground flex-1">
                  <p className="text-muted-foreground leading-relaxed">
                    {visibleParts().map((part, i) =>
                      part.text ? (
                        part.type === "code" ? (
                          <code
                            key={i}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground"
                          >
                            {part.text}
                          </code>
                        ) : (
                          <span key={i}>{part.text}</span>
                        )
                      ) : null,
                    )}
                    {charIndex < totalChars && (
                      <span className="inline-block w-0.5 h-4 align-text-bottom bg-primary animate-pulse ml-0.5" />
                    )}
                  </p>

                  {/* Code reference — slides in after typing finishes */}
                  <div
                    className={`rounded border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground
                      transition-all duration-300 ease-out origin-top
                      ${
                        showCodeRef
                          ? "opacity-100 max-h-20 translate-y-0"
                          : "opacity-0 max-h-0 translate-y-1 overflow-hidden py-0 border-transparent"
                      }`}
                  >
                    <span className="text-primary">src/auth/middleware.ts</span>{" "}
                    — lines 12-34
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-2xl font-semibold text-foreground mb-1.5">
            How it works
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Everything you need to navigate an unfamiliar codebase.
          </p>
          <div className="grid gap-10 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title}>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border bg-background text-primary">
                  <feature.icon size={18} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">&copy; 2026 CodeMap</p>
          <div className="flex items-center gap-5">
            <a
              href="mailto:hello@codemap.dev"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact us
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

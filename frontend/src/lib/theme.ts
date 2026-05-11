export type ThemeOption = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "settings.theme";
const DARK_CLASS = "dark";

let systemMql: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

/** Read the saved theme from localStorage. Defaults to `"system"` if unset/invalid. */
export function readTheme(): ThemeOption {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function setDarkClass(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
}

function detachSystemListener(): void {
  if (systemMql && systemListener) {
    systemMql.removeEventListener("change", systemListener);
  }
  systemMql = null;
  systemListener = null;
}

/**
 * Apply the given theme to `<html>` immediately and (for `"system"`)
 * subscribe to OS-level scheme changes so the app keeps in sync.
 *
 * Idempotent: safe to call repeatedly. Detaches any prior system listener.
 */
export function applyTheme(theme: ThemeOption): void {
  if (typeof window === "undefined") return;

  detachSystemListener();

  if (theme === "dark") {
    setDarkClass(true);
    return;
  }
  if (theme === "light") {
    setDarkClass(false);
    return;
  }

  // System mode: match `prefers-color-scheme` and update on change.
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  setDarkClass(mql.matches);

  systemMql = mql;
  systemListener = (event: MediaQueryListEvent) => setDarkClass(event.matches);
  mql.addEventListener("change", systemListener);
}

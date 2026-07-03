// Shared theme utilities. Server reads the `relay-theme` cookie and renders
// <html className="dark"> directly, so we no longer need a pre-hydration <script>
// bootstrap to prevent FOUC. Every client-side toggle must keep the cookie in
// sync so the next SSR matches.
//
// Previously a next/script <Script strategy="beforeInteractive"> injected the
// theme, but in Next.js 16 + React 19 any <script> element in the component
// tree fires a "script tag inside React component" dev warning.
//
// Legacy rename: the cookie/localStorage key was `ainative-theme` before the
// Relay rebrand. We WRITE only `relay-theme` now but still READ the legacy key
// as a fallback so a returning user's saved theme (and their next SSR) survives
// the upgrade without a flash of the default theme. Drop the fallback once the
// max-age of any old cookie (1 year) has lapsed for the install base.

export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "relay-theme";
export const LEGACY_THEME_COOKIE = "ainative-theme";
export const DEFAULT_THEME: ResolvedTheme = "light";

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

/**
 * Client-only: apply a theme everywhere it needs to land — DOM, localStorage,
 * and cookie. Always use this instead of setting them individually so we can't
 * drift between storage locations.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor =
    theme === "dark" ? "oklch(0.14 0.02 250)" : "oklch(0.985 0.004 250)";
  try {
    localStorage.setItem(THEME_COOKIE, theme);
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;SameSite=Lax`;
}

/**
 * Client-only: flip the current theme and apply. Returns the new theme.
 */
export function toggleTheme(): ResolvedTheme {
  const current: ResolvedTheme = document.documentElement.classList.contains(
    "dark"
  )
    ? "dark"
    : "light";
  const next: ResolvedTheme = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/**
 * Client-only: resolve the user's preferred theme from localStorage, falling
 * back to the cookie, then the default. Used by the toggle button to seed its
 * `dark` state on mount. Reads the current key first, then the legacy
 * `ainative-theme` key so a pre-rebrand saved theme still applies on mount.
 */
export function readClientTheme(): ResolvedTheme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  for (const key of [THEME_COOKIE, LEGACY_THEME_COOKIE]) {
    try {
      const stored = localStorage.getItem(key);
      if (isResolvedTheme(stored)) return stored;
    } catch {
      /* storage may be unavailable (private mode, quota) */
    }
    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${key}=([^;]+)`)
    );
    const cookieValue = cookieMatch?.[1];
    if (isResolvedTheme(cookieValue)) return cookieValue;
  }
  return DEFAULT_THEME;
}

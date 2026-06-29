import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import { CommandPalette } from "@/components/shared/command-palette";
import { PendingApprovalHost } from "@/components/notifications/pending-approval-host";
import { GlobalShortcuts } from "@/components/shared/global-shortcuts";
import { Toaster } from "@/components/ui/sonner";
import { ChatSessionProvider } from "@/components/chat/chat-session-provider";
import { RuntimePreferenceBootstrapper } from "@/components/onboarding/runtime-preference-bootstrapper";
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  isResolvedTheme,
  type ResolvedTheme,
} from "@/lib/theme";
import "./globals.css";

// Orionfold superfamily: Geist (display + body) + Geist Mono (data / eyebrows /
// receipts). Loaded via next/font/google — self-hosted at build, no CDN.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orionfold Relay",
  description: "Multi-agent orchestration for AI-native work",
  icons: {
    // Explicit metadata.icons (not convention-based icon.tsx) — convention files
    // use process.cwd() and break under npx. See npx-process-cwd.test.ts.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Inline theme bootstrap prevents a flash between the server render and local theme preference.
// Default is light theme for fresh visits (no localStorage).
const CRITICAL_THEME_CSS = `
  :root {
    color-scheme: light;
    --background: oklch(0.985 0.004 250);
    --foreground: oklch(0.14 0.02 250);
    --surface-1: oklch(1 0 0);
    --surface-2: oklch(0.975 0.004 250);
    --border: oklch(0.90 0.006 250);
  }
  html.dark {
    color-scheme: dark;
    --background: oklch(0.14 0.02 250);
    --foreground: oklch(0.92 0.01 250);
    --surface-1: oklch(0.18 0.02 250);
    --surface-2: oklch(0.16 0.02 250);
    --border: oklch(0.26 0.015 250);
  }
  html { background: var(--background); font-size: 14px; }
`.replace(/\s+/g, " ").trim();

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve theme server-side from the ainative-theme cookie. Every client-side
  // theme toggle writes this cookie (see src/lib/theme.ts), so SSR stays in
  // sync with the user's preference and there is no FOUC — and no pre-hydration
  // <script> tag, which is what React 19 warns about.
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(THEME_COOKIE)?.value;
  const theme: ResolvedTheme = isResolvedTheme(cookieValue)
    ? cookieValue
    : DEFAULT_THEME;
  const htmlClass = theme === "dark" ? "dark" : undefined;
  const htmlBackground =
    theme === "dark" ? "oklch(0.14 0.02 250)" : "oklch(0.985 0.004 250)";
  return (
    <html
      lang="en"
      className={htmlClass}
      data-theme={theme}
      style={{ colorScheme: theme, backgroundColor: htmlBackground }}
      suppressHydrationWarning
    >
      <head>
        {/* Static CSS — no user input, safe from XSS */}
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_THEME_CSS }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        <TooltipProvider>
          <ChatSessionProvider>
            <AppShell>{children}</AppShell>
            <PendingApprovalHost />
            <CommandPalette />
            <GlobalShortcuts />
            <RuntimePreferenceBootstrapper />
            <Toaster />
          </ChatSessionProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

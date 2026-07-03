import type { ReactNode } from "react";
import { AppBar } from "./app-bar";
import { TelemetryRail } from "./telemetry-rail";
import { listAppsCached } from "@/lib/apps/registry";
import type { AppInstance } from "./nav-items";

// The Arena-shape shell: two-tier app bar → telemetry rail → centered canvas.
// Mounted once in the server `layout.tsx`, wrapping `{children}` — every route's
// Server Components render unchanged inside the centered canvas while inheriting
// the shell chrome. This is an async Server Component so it can read the live
// composed-app instances (listAppsCached, 5s TTL) that fill the Apps section's
// tier-2 row. The bar itself is a Client Component for usePathname() active
// state; instances are passed down as plain serializable props.

export async function AppShell({ children }: { children: ReactNode }) {
  const apps: AppInstance[] = listAppsCached().map((app) => ({
    id: app.id,
    name: app.name,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar apps={apps} />
      <TelemetryRail />
      <main id="main-content" className="flex-1 px-[clamp(20px,4vw,40px)] py-7">
        <div className="mx-auto w-full max-w-[96rem]">{children}</div>
      </main>
    </div>
  );
}

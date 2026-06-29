import type { ReactNode } from "react";
import { AppBar } from "./app-bar";
import { TelemetryRail } from "./telemetry-rail";

// The Arena-shape shell: app bar (with the in-bar accordion nav) → telemetry
// rail → centered canvas. Mounted once in the server `layout.tsx`, wrapping
// `{children}` — every route's Server Components render unchanged inside the
// centered canvas while inheriting the shell chrome. The whole IA now lives in
// the bar's accordion, so there is no drawer and no shell-level client state;
// this wrapper can be a plain Server Component.

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppBar />
      <TelemetryRail />
      <main id="main-content" className="flex-1 px-[clamp(20px,4vw,40px)] py-7">
        <div className="mx-auto w-full max-w-[96rem]">{children}</div>
      </main>
    </div>
  );
}

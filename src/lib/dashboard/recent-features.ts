export interface RecentFeature {
  id: string;
  title: string;
  summary: string;
  href: string;
  actionLabel: string;
  launchedAt: string;
}

export const RECENT_FEATURES: readonly RecentFeature[] = [
  {
    id: "operator-workshop",
    title: "Relay Operator Workshop",
    summary: "Run a deterministic local workshop and export the capstone.",
    href: "/workshop",
    actionLabel: "Run Workshop",
    launchedAt: "2026-07-16",
  },
  {
    id: "semantic-table-rendering",
    title: "Semantic table rendering",
    summary: "Switch between dense rows and type-aware rendered records.",
    href: "/tables",
    actionLabel: "Open Tables",
    launchedAt: "2026-07-16",
  },
  {
    id: "adaptive-home",
    title: "Adaptive Home controls",
    summary: "Choose dashboard modules and deterministic smart ordering.",
    href: "/settings#settings-dashboard",
    actionLabel: "Customize Home",
    launchedAt: "2026-07-16",
  },
  {
    id: "local-model-routing",
    title: "Local model task routing",
    summary: "Route work across configured Ollama, LM Studio and LiteLLM runtimes.",
    href: "/settings#settings-runtime",
    actionLabel: "Review Routing",
    launchedAt: "2026-07-15",
  },
] as const;

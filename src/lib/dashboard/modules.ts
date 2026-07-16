export const DASHBOARD_MODULE_IDS = [
  "attention",
  "activity",
  "packs",
  "projects",
  "documents",
  "costs",
  "health",
  "quickActions",
  "workshop",
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number];

export interface DashboardModuleDefinition {
  id: DashboardModuleId;
  title: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  span: "wide" | "narrow";
  sourceRoute: string;
}

export const DASHBOARD_MODULES: readonly DashboardModuleDefinition[] = [
  {
    id: "attention",
    title: "Needs attention",
    description: "Failed, waiting, queued and active work requiring operator awareness.",
    defaultVisible: true,
    defaultOrder: 0,
    span: "wide",
    sourceRoute: "/tasks",
  },
  {
    id: "activity",
    title: "Autonomous activity",
    description: "Recent agent and workflow activity.",
    defaultVisible: true,
    defaultOrder: 1,
    span: "narrow",
    sourceRoute: "/monitor",
  },
  {
    id: "packs",
    title: "Installed Packs and apps",
    description: "Installed operating surfaces and their active primitives.",
    defaultVisible: true,
    defaultOrder: 2,
    span: "wide",
    sourceRoute: "/apps",
  },
  {
    id: "projects",
    title: "Projects and workflows",
    description: "Recently active project scopes and task completion.",
    defaultVisible: true,
    defaultOrder: 3,
    span: "wide",
    sourceRoute: "/projects",
  },
  {
    id: "documents",
    title: "Recent outputs",
    description: "Recent retained documents and task outputs.",
    defaultVisible: true,
    defaultOrder: 4,
    span: "narrow",
    sourceRoute: "/documents",
  },
  {
    id: "costs",
    title: "Cost and budget",
    description: "Measured local usage and pricing completeness.",
    defaultVisible: true,
    defaultOrder: 5,
    span: "narrow",
    sourceRoute: "/costs",
  },
  {
    id: "health",
    title: "Runtime and environment health",
    description: "Configured local and cloud runtimes plus environment setup.",
    defaultVisible: true,
    defaultOrder: 6,
    span: "narrow",
    sourceRoute: "/settings#settings-providers",
  },
  {
    id: "quickActions",
    title: "Quick actions and onboarding",
    description: "Common destinations and remaining activation steps.",
    defaultVisible: true,
    defaultOrder: 7,
    span: "narrow",
    sourceRoute: "/settings",
  },
  {
    id: "workshop",
    title: "Operator Workshop",
    description: "Current local workshop run and checkpoint progress.",
    defaultVisible: true,
    defaultOrder: 8,
    span: "wide",
    sourceRoute: "/workshop",
  },
] as const;

export interface DashboardPreferences {
  version: 1;
  smartOrdering: boolean;
  visible: Partial<Record<DashboardModuleId, boolean>>;
}

export interface DashboardModuleSignal {
  eligible?: boolean;
  urgentCount?: number;
  activeCount?: number;
  failureCount?: number;
  recentAt?: number | null;
  relevanceCount?: number;
}

export type DashboardSignals = Partial<
  Record<DashboardModuleId, DashboardModuleSignal>
>;

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  version: 1,
  smartOrdering: true,
  visible: {},
};

export function isModuleVisible(
  definition: DashboardModuleDefinition,
  preferences: DashboardPreferences
): boolean {
  return preferences.visible[definition.id] ?? definition.defaultVisible;
}

function recencyBucket(timestamp: number | null | undefined, now: number): number {
  if (!timestamp) return 0;
  const age = Math.max(0, now - timestamp);
  if (age <= 60 * 60 * 1000) return 4;
  if (age <= 24 * 60 * 60 * 1000) return 3;
  if (age <= 7 * 24 * 60 * 60 * 1000) return 2;
  if (age <= 30 * 24 * 60 * 60 * 1000) return 1;
  return 0;
}

export function rankDashboardModules(
  preferences: DashboardPreferences,
  signals: DashboardSignals,
  now = Date.now()
): DashboardModuleDefinition[] {
  const visible = DASHBOARD_MODULES.filter((definition) => {
    const signal = signals[definition.id];
    return (
      isModuleVisible(definition, preferences) &&
      (signal?.eligible ?? definition.id !== "workshop")
    );
  });
  if (!preferences.smartOrdering) {
    return [...visible].sort((a, b) => a.defaultOrder - b.defaultOrder);
  }
  const score = (definition: DashboardModuleDefinition) => {
    const signal = signals[definition.id] ?? {};
    return (
      Math.min(signal.urgentCount ?? 0, 9) * 10_000 +
      Math.min(signal.activeCount ?? 0, 9) * 1_000 +
      Math.min(signal.failureCount ?? 0, 9) * 500 +
      recencyBucket(signal.recentAt, now) * 100 +
      Math.min(signal.relevanceCount ?? 0, 9) * 10 -
      definition.defaultOrder
    );
  };
  return [...visible].sort(
    (a, b) => score(b) - score(a) || a.id.localeCompare(b.id)
  );
}

export function hiddenUrgentCount(
  preferences: DashboardPreferences,
  signals: DashboardSignals
): number {
  return DASHBOARD_MODULES.reduce((total, definition) => {
    if (isModuleVisible(definition, preferences)) return total;
    return total + (signals[definition.id]?.urgentCount ?? 0);
  }, 0);
}

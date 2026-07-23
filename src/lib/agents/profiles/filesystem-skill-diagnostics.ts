export type FilesystemSkillIssueKind =
  | "unavailable-entry"
  | "unreadable-skill"
  | "malformed-skill"
  | "scanner-failure";

export interface FilesystemSkillIssue {
  kind: FilesystemSkillIssueKind;
  scope: "filesystem-project" | "filesystem-user";
  path: string;
  reason: string;
}

export interface FilesystemSkillDiagnosticReport {
  scannedAt: string;
  root: string;
  scope: FilesystemSkillIssue["scope"];
  loadedCount: number;
  issues: FilesystemSkillIssue[];
}

const REPORT_LIMIT = 20;
const WARNING_DEDUP_MS = 60_000;
let reports: FilesystemSkillDiagnosticReport[] = [];
let lastWarning: { signature: string; at: number } | null = null;

export function recordFilesystemSkillDiagnostics(
  report: FilesystemSkillDiagnosticReport,
): void {
  reports = [...reports.slice(-(REPORT_LIMIT - 1)), report];
}

export function readFilesystemSkillDiagnostics(): FilesystemSkillDiagnosticReport[] {
  return reports.map((report) => ({
    ...report,
    issues: report.issues.map((issue) => ({ ...issue })),
  }));
}

export function summarizeFilesystemSkillIssues(
  issues: FilesystemSkillIssue[],
): string | null {
  if (issues.length === 0) return null;
  const counts = new Map<FilesystemSkillIssueKind, number>();
  for (const issue of issues) {
    counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1);
  }
  const labels: Record<FilesystemSkillIssueKind, string> = {
    "unavailable-entry": "unavailable",
    "unreadable-skill": "unreadable",
    "malformed-skill": "malformed",
    "scanner-failure": "scanner failure",
  };
  const detail = [...counts.entries()]
    .map(([kind, count]) => `${count} ${labels[kind]}`)
    .join(", ");
  return `[listFusedProfiles] skipped ${issues.length} filesystem skill ${
    issues.length === 1 ? "entry" : "entries"
  } (${detail}); valid profiles remain available. Details: /api/diagnostics/filesystem-skills`;
}

export function warnFilesystemSkillIssues(
  issues: FilesystemSkillIssue[],
  now = Date.now(),
): void {
  const message = summarizeFilesystemSkillIssues(issues);
  if (!message) return;
  const signature = issues
    .map((issue) => `${issue.scope}:${issue.kind}`)
    .sort()
    .join("|");
  if (
    lastWarning?.signature === signature &&
    now - lastWarning.at < WARNING_DEDUP_MS
  ) {
    return;
  }
  lastWarning = { signature, at: now };
  console.warn(message);
}

export function resetFilesystemSkillDiagnosticsForTests(): void {
  reports = [];
  lastWarning = null;
}

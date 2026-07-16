interface GreetingProps {
  runningCount: number;
  awaitingCount: number;
  failedCount: number;
  activeWorkflows: number;
  hiddenUrgentCount?: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Greeting({
  runningCount,
  awaitingCount,
  failedCount,
  activeWorkflows,
  hiddenUrgentCount = 0,
}: GreetingProps) {
  const parts: string[] = [];
  if (runningCount > 0) parts.push(`${runningCount} task${runningCount !== 1 ? "s" : ""} running`);
  if (activeWorkflows > 0) parts.push(`${activeWorkflows} workflow${activeWorkflows !== 1 ? "s" : ""} active`);
  if (awaitingCount > 0) parts.push(`${awaitingCount} awaiting your review`);
  if (failedCount > 0) parts.push(`${failedCount} failed task${failedCount !== 1 ? "s" : ""} to address`);

  const summary = parts.length > 0
    ? `You have ${parts.join(", ")}.`
    : hiddenUrgentCount > 0
      ? `${hiddenUrgentCount} unresolved item${hiddenUrgentCount === 1 ? "" : "s"} exist in hidden dashboard modules.`
      : "All clear. No tasks need your attention.";

  return (
    <div className="surface-card rounded-lg p-5 mb-6">
      <h2 className="text-xl font-bold">{getGreeting()}</h2>
      <p className="text-sm text-muted-foreground mt-1">{summary}</p>
    </div>
  );
}

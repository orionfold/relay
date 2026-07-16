export function CostHealthModule({
  costMicros,
  runs,
  unknownPricingRuns,
}: {
  costMicros: number;
  runs: number;
  unknownPricingRuns: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Metric label="Measured cost" value={`$${(costMicros / 1_000_000).toFixed(2)}`} />
      <Metric label="Runs" value={runs.toLocaleString()} />
      <Metric label="Unknown pricing" value={unknownPricingRuns.toLocaleString()} />
    </div>
  );
}

export function RuntimeHealthModule({
  configured,
  unconfigured,
}: {
  configured: number;
  unconfigured: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Metric label="Configured runtimes" value={configured.toLocaleString()} />
      <Metric label="Available to configure" value={unconfigured.toLocaleString()} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card-muted rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

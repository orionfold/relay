import type { ColumnSchemaRef } from "@/lib/apps/view-kits/types";

interface SentimentBuckets {
  positive: number;
  neutral: number;
  negative: number;
}

interface ThroughputStripProps {
  dailyDrafts: number[];           // last 7 days, oldest → newest
  sentimentBuckets?: SentimentBuckets;
}

const SENTIMENT_COL_NAME_RE = /(^sentiment$|_sentiment$)/i;

export function hasSentimentColumn(schemas: ColumnSchemaRef[]): boolean {
  return schemas.some((s) =>
    s.columns.some(
      (c) => c.semantic === "sentiment" || SENTIMENT_COL_NAME_RE.test(c.name)
    )
  );
}

function MiniBar({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg
      data-testid="throughput-mini-bar"
      viewBox={`0 0 ${values.length * 8} 24`}
      className="h-6 w-24"
      role="img"
      aria-label="drafts per day"
    >
      {values.map((v, i) => {
        const h = Math.round((v / max) * 22);
        return (
          <rect
            key={i}
            x={i * 8}
            y={24 - h}
            width={6}
            height={h}
            className="fill-primary"
            rx={1}
          />
        );
      })}
    </svg>
  );
}

function DonutRing({ buckets }: { buckets: SentimentBuckets }) {
  const total = Math.max(1, buckets.positive + buckets.neutral + buckets.negative);
  const r = 10;
  const c = 2 * Math.PI * r;
  const seg = (n: number) => (n / total) * c;
  let acc = 0;
  const arc = (n: number, color: string) => {
    const len = seg(n);
    const dash = `${len} ${c - len}`;
    const offset = -acc;
    acc += len;
    return (
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeDasharray={dash}
        strokeDashoffset={offset}
        className={color}
      />
    );
  };

  return (
    <svg
      data-testid="throughput-sentiment-ring"
      viewBox="0 0 28 28"
      className="h-7 w-7"
      role="img"
      aria-label="sentiment distribution"
    >
      {arc(buckets.positive, "stroke-status-completed")}
      {arc(buckets.neutral, "stroke-muted-foreground")}
      {arc(buckets.negative, "stroke-status-failed")}
    </svg>
  );
}

export function ThroughputStrip({
  dailyDrafts,
  sentimentBuckets,
}: ThroughputStripProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          Drafts/day
        </span>
        <MiniBar values={dailyDrafts} />
      </div>
      {sentimentBuckets && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Sentiment
          </span>
          <DonutRing buckets={sentimentBuckets} />
        </div>
      )}
    </div>
  );
}

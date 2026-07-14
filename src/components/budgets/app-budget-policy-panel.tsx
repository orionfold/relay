"use client";

import { useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { BudgetPolicyControl } from "./budget-policy-control";
import type { AppBudgetSnapshot } from "@/lib/schedules/budget-policies";

export function AppBudgetPolicyPanel({
  initialSnapshot,
}: {
  initialSnapshot: AppBudgetSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const endpoint = `/api/apps/${snapshot.appId}/budgets`;
  const appRecommendations = snapshot.recommendations.filter(
    (recommendation) => recommendation.scope === "app"
  );

  return (
    <section className="space-y-3" aria-labelledby="app-budget-heading">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 id="app-budget-heading" className="text-base font-semibold">
            Cost policies
          </h2>
          <p className="text-sm text-muted-foreground">
            Pack limits are recommendations. They affect scheduled runs only after you accept or edit them.
          </p>
        </div>
      </div>

      <BudgetPolicyControl
        title="Whole app"
        description="Combined spend across every schedule in this app."
        scopeType="app"
        scopeId={snapshot.appId}
        policy={snapshot.appPolicy}
        recommendations={appRecommendations}
        endpoint={endpoint}
        requestMode="app"
        onSnapshot={(next) => setSnapshot(next as AppBudgetSnapshot)}
      />

      {snapshot.schedules.length > 0 && (
        <details className="group rounded-lg border bg-[var(--surface-1)]">
          <summary className="flex list-none items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Schedule policies</span>
              <span className="block text-xs text-muted-foreground">
                Add tighter limits for individual scheduled workflows
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="space-y-3 border-t p-4">
            {snapshot.schedules.map((schedule) => (
              <BudgetPolicyControl
                key={schedule.id}
                title={schedule.name}
                scopeType="schedule"
                scopeId={schedule.id}
                policy={schedule.policy}
                recommendations={schedule.recommendations}
                endpoint={endpoint}
                requestMode="app"
                onSnapshot={(next) => setSnapshot(next as AppBudgetSnapshot)}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

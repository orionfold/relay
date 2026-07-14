"use client";

import { useEffect, useState } from "react";
import { BudgetPolicyControl } from "./budget-policy-control";
import { BudgetPolicyStatusBadge } from "./budget-policy-status-badge";
import type { ScheduleBudgetSnapshot } from "@/lib/schedules/budget-policies";

export function ScheduleBudgetPolicyPanel({
  initialSnapshot,
}: {
  initialSnapshot: ScheduleBudgetSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  useEffect(() => setSnapshot(initialSnapshot), [initialSnapshot]);
  const ownPolicy =
    snapshot.effectivePolicies.find(
      (policy) => policy.scopeType === "schedule"
    ) ?? null;
  const inheritedPolicy = snapshot.effectivePolicies.find(
    (policy) => policy.scopeType === "app"
  );
  const recommendations = snapshot.recommendations.filter(
    (recommendation) => recommendation.scope === "schedule"
  );

  return (
    <div className="space-y-3">
      {inheritedPolicy && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-xs">
          <span>Inherited app-wide cost policy</span>
          <BudgetPolicyStatusBadge health={inheritedPolicy.health} />
        </div>
      )}
      <BudgetPolicyControl
        title="Schedule cost policy"
        description="The tighter of this limit and any app-wide limit controls each run."
        scopeType="schedule"
        scopeId={snapshot.scheduleId}
        policy={ownPolicy}
        recommendations={recommendations}
        endpoint={`/api/schedules/${snapshot.scheduleId}/budget`}
        requestMode="schedule"
        onSnapshot={(next) => setSnapshot(next as ScheduleBudgetSnapshot)}
      />
    </div>
  );
}

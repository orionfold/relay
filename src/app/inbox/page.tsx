import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { desc, eq, and, gte } from "drizzle-orm";
import { InboxList } from "@/components/notifications/inbox-list";
import { GovernanceStats } from "@/components/notifications/governance-stats";
import { PageShell } from "@/components/shared/page-shell";
import {
  buildDefaultNotificationVisibilityCondition,
  filterDefaultVisibleNotifications,
} from "@/lib/notifications/visibility";
import { attachCompletionContext } from "@/lib/notifications/completion-context";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [rows, pendingCount, approvedTodayCount, deniedTodayCount] =
    await Promise.all([
      db
        .select()
        .from(notifications)
        .where(buildDefaultNotificationVisibilityCondition())
        .orderBy(desc(notifications.createdAt))
        .limit(100),
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "permission_required"),
            eq(notifications.read, false)
          )
        )
        .then((r) => r.length),
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "permission_required"),
            eq(notifications.response, "approved"),
            gte(notifications.respondedAt, today)
          )
        )
        .then((r) => r.length),
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "permission_required"),
            eq(notifications.response, "denied"),
            gte(notifications.respondedAt, today)
          )
        )
        .then((r) => r.length),
    ]);

  // Serialize Date objects for client component consumption
  const rowsWithOutputs = await attachCompletionContext(rows);
  const initialNotifications = filterDefaultVisibleNotifications(
    rowsWithOutputs.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      respondedAt: n.respondedAt?.toISOString() ?? null,
    }))
  );

  return (
    <PageShell
      title="Inbox"
      description="Governance command center. Review approvals, questions, and agent activity."
    >
      <GovernanceStats
        pending={pendingCount}
        approvedToday={approvedTodayCount}
        deniedToday={deniedTodayCount}
      />
      <InboxList initialNotifications={initialNotifications} />
    </PageShell>
  );
}

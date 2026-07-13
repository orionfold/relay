import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

import { buildDefaultNotificationVisibilityCondition } from "@/lib/notifications/visibility";
import { attachCompletionContext } from "@/lib/notifications/completion-context";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const unread = url.searchParams.get("unread");
  const type = url.searchParams.get("type");
  const countOnly = url.searchParams.get("countOnly");

  const conditions = [buildDefaultNotificationVisibilityCondition()];
  if (unread === "true") conditions.push(eq(notifications.read, false));
  if (type) conditions.push(eq(notifications.type, type as typeof notifications.type.enumValues[number]));

  if (countOnly === "true") {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        conditions.length > 0 ? and(...conditions) : eq(notifications.read, false)
      );
    return NextResponse.json({ count: result?.count ?? 0 });
  }

  const result = await db
    .select()
    .from(notifications)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return NextResponse.json(await attachCompletionContext(result));
}

"use client";

import { StatusChip } from "@/components/shared/status-chip";

interface ScheduleStatusBadgeProps {
  status: string;
}

export function ScheduleStatusBadge({ status }: ScheduleStatusBadgeProps) {
  return <StatusChip status={status} family="schedule" />;
}

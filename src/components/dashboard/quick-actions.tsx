"use client";

import { useRouter } from "next/navigation";
import { Plus, FolderPlus, Inbox, Activity, Workflow, FileText, Bot, Clock } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";

export function QuickActions() {
  const router = useRouter();

  const actions = [
    { label: "New Task", icon: Plus, href: "/tasks/new" },
    { label: "Projects", icon: FolderPlus, href: "/projects" },
    { label: "Inbox", icon: Inbox, href: "/inbox" },
    { label: "Monitor", icon: Activity, href: "/monitor" },
    { label: "Workflows", icon: Workflow, href: "/workflows" },
    { label: "Documents", icon: FileText, href: "/documents" },
    { label: "Agents", icon: Bot, href: "/agents" },
    { label: "Schedules", icon: Clock, href: "/schedules" },
  ];

  return (
    <div className="mb-6">
      <SectionHeading>Quick Navigation</SectionHeading>
      <div className="grid grid-cols-4 gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => router.push(action.href)}
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <action.icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

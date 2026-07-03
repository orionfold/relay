"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { Loader2, Trash2, Database } from "lucide-react";

export function DataManagementSection() {
  const [clearOpen, setClearOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClear() {
    setLoading(true);
    try {
      const res = await fetch("/api/data/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const d = data.deleted;
        toast.success(
          `Cleared ${d.projects} projects, ${d.tasks} tasks, ${d.workflows} workflows, ${d.schedules} schedules, ${d.documents} documents, ${d.conversations} conversations, ${d.chatMessages} messages, ${d.learnedContext} learned context, ${d.views} views, ${d.usageLedger} usage entries, ${d.agentLogs} logs, ${d.notifications} notifications, ${d.sampleProfiles} sample profiles, ${d.files} files`
        );
      } else {
        toast.error(`Clear failed: ${data.error}`);
      }
    } catch {
      toast.error("Clear failed. Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setLoading(true);
    try {
      const res = await fetch("/api/data/seed", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const s = data.seeded;
        toast.success(
          `Seeded ${s.profiles} profiles, ${s.projects} projects, ${s.tasks} tasks, ${s.workflows} workflows, ${s.schedules} schedules, ${s.documents} documents, ${s.userTables} tables (${s.userTableRows} rows, ${s.tableViews} views, ${s.tableTriggers} triggers, ${s.tableRelationships} links), ${s.conversations} conversations, ${s.chatMessages} messages, ${s.agentMemory} memories, ${s.agentMessages} handoffs, ${s.channelConfigs} channels (${s.channelBindings} bindings), ${s.environmentScans} scans (${s.environmentArtifacts} artifacts, ${s.environmentCheckpoints} checkpoints, ${s.environmentTemplates} templates), ${s.workflowExecutionStats} workflow-stats, ${s.scheduleFiringMetrics} firing-metrics, ${s.usageLedger} usage entries, ${s.learnedContext} learned context, ${s.views} views, ${s.profileTestResults} test results, ${s.repoImports} repo imports, ${s.agentLogs} logs, ${s.notifications} notifications`
        );
      } else {
        toast.error(`Seed failed: ${data.error}`);
      }
    } catch {
      toast.error("Seed failed. Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Reset or populate your Orionfold Relay instance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Delete all projects, tasks, workflows, schedules, documents,
                conversations, chat messages, usage ledger, learned context,
                saved views, agent logs, notifications, seeded sample profiles,
                and uploaded files.{" "}
                <strong>Database snapshots and authentication settings are preserved.</strong>
              </p>
              <Badge variant="destructive" className="shrink-0">Irreversible</Badge>
            </div>
            <Button
              variant="destructive"
              onClick={() => setClearOpen(true)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Clear All Data
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Populate with 5 agent profiles, 8 projects across 3 personas
              (solo founder, agency, PE ops), 48 tasks, 8 workflows, 8 schedules
              (3 heartbeat monitors), 18 markdown documents, 6 data tables with
              rows, views, triggers, and cross-table links, 6 conversations
              with chat messages, ~17 agent memories across fact/preference/
              pattern/outcome categories, 9 inter-profile handoffs (pending,
              accepted, completed, expired), 5 channel configs (Slack,
              Telegram, webhooks) with bidirectional bindings, an environment
              scan with 15 discovered artifacts + checkpoints + templates,
              workflow execution stats + schedule firing metrics for the
              Analytics page, document and table input pools, usage ledger,
              learned context, saved views, profile test results, repo
              imports, agent logs, and notifications. Existing data is
              cleared first.
            </p>
            <Button
              variant="outline"
              onClick={() => setSeedOpen(true)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Seed Sample Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all data?"
        description="This will permanently delete all projects, tasks, workflows, schedules, documents, conversations, chat messages, usage ledger, learned context, saved views, agent logs, notifications, seeded sample profiles, and uploaded files. Database snapshots and authentication settings will be preserved. This action cannot be undone."
        confirmLabel="Clear All Data"
        onConfirm={handleClear}
        destructive
      />

      <ConfirmDialog
        open={seedOpen}
        onOpenChange={setSeedOpen}
        title="Seed sample data?"
        description="This will clear all existing data first, then populate profiles, projects, tasks, workflows, schedules, documents, tables (with views/triggers/relationships), conversations, agent memories, handoffs, channels, an environment scan with artifacts/checkpoints/templates, analytics rollups, document and table input pools, usage ledger, learned context, saved views, profile test results, repo imports, agent logs, and notifications. Any current data will be lost."
        confirmLabel="Seed Data"
        onConfirm={handleSeed}
      />
    </>
  );
}

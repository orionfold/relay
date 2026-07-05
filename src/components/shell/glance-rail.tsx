"use client";

// FEAT-14 — Settings at a glance (WS4, 2026-07-05).
// A two-level progressive-disclosure rail below the telemetry rail, sharing its
// compact RailCell grammar (mono label over value, left-aligned, vertical
// dividers). Collapsed: a left-aligned summary row of cells + a single "Open"
// deep-link on the bar. Expanded: ONE horizontal row of labeled groups
// (Runtime · Execution · Budget · Permissions · Integrations), each a header +
// sub-row of cells, non-wrapping (scrolls if narrow) like the telemetry strip.
// Read-only — edits stay on /settings. Data comes from one consolidated read
// (useSettingsGlance → /api/settings/glance); shadow-path discipline throughout
// — only resolved fields render, a failed read collapses the rail to nothing.

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Cpu,
  Gauge,
  Wallet,
  ShieldCheck,
  Plug,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMicros } from "./rail-cell";
import {
  useSettingsGlance,
  type SettingsGlanceResponse,
} from "./use-settings-glance";

// Preset id → short human label (grade 3-5, no em-dashes).
const PRESET_LABEL: Record<string, string> = {
  "read-only": "Read only",
  "git-safe": "Git safe",
  "full-auto": "Full auto",
};

// Routing preference → short label.
const ROUTING_LABEL: Record<string, string> = {
  cost: "Cost",
  latency: "Latency",
  quality: "Quality",
  manual: "Manual",
};

// One compact cell — the SAME grammar as the telemetry RailCell: a mono
// micro-label over a left-aligned value, with a right-hairline vertical divider
// (.glance-cell). Used for both the collapsed summary and the expanded panel so
// the glance rail matches the telemetry rail above it. Renders nothing when the
// value is null, so a row only shows what resolved.
function Cell({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null;
  return (
    <div className="glance-cell flex min-w-[7rem] flex-none flex-col gap-0.5 px-3">
      <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// A labeled section in the expanded panel: a mono section eyebrow above a
// horizontal sub-row of compact cells (same left-aligned RailCell grammar).
// Groups sit side by side in ONE row (like the telemetry cell strip), never
// wrapping — a stronger right border separates one group from the next. The
// per-cell "Settings" link is gone; a single deep-link lives on the collapse bar.
function Group({
  icon,
  title,
  cells,
}: {
  icon: React.ReactNode;
  title: string;
  cells: Array<{ label: string; value: string | null }>;
}) {
  // Hide a whole section if nothing in it resolved.
  if (cells.every((c) => c.value == null)) return null;
  return (
    <div className="flex flex-none flex-col gap-1.5 border-r border-border pr-3 last:border-r-0">
      <div className="flex items-center gap-1.5 px-3 font-mono text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        <span className="flex h-3 w-3 items-center justify-center [&_svg]:h-3 [&_svg]:w-3">
          {icon}
        </span>
        {title}
      </div>
      <div className="flex items-stretch">
        {cells.map((c) => (
          <Cell key={c.label} label={c.label} value={c.value} />
        ))}
      </div>
    </div>
  );
}

// Derive the collapsed chips + expanded pills from a resolved payload. Values
// are formatted to null when their source field is null (shadow paths).
function budgetCapLabel(data: SettingsGlanceResponse): string | null {
  return data.budgetMonthlyCapUsd != null
    ? `${formatMicros(data.budgetMonthlyCapUsd * 1_000_000)}/mo`
    : null;
}

function licenseLabel(data: SettingsGlanceResponse): string {
  return data.licenseTag.kind === "licensed"
    ? data.licenseTag.label
    : "Community";
}

function boolLabel(v: boolean | null): string | null {
  return v == null ? null : v ? "On" : "Off";
}

// Preset label with a "Custom" fallback for the expanded view.
function presetLabel(id: string | null): string | null {
  if (!id) return null;
  return PRESET_LABEL[id] ?? id;
}
function routingLabel(p: string | null): string | null {
  if (!p) return null;
  return ROUTING_LABEL[p] ?? p;
}

export function GlanceRail() {
  const glance = useSettingsGlance();
  const [expanded, setExpanded] = useState(false);

  // Failed first read (error + no last-good) → render nothing. The rail
  // collapses to zero height; no crash, no empty chrome band.
  if (glance.status === "error" && glance.data == null) return null;
  const data = glance.data;

  // The collapsed chip set — every resolved setting, dense, spanning the full
  // rail width like the telemetry rail. Chips render null when their field is
  // null, so the row only shows what resolved.
  const chips: Array<{ label: string; value: string | null }> = data
    ? [
        { label: "Model", value: data.activeModel },
        { label: "Runtime", value: data.activeRuntimeLabel },
        { label: "Routing", value: routingLabel(data.routingPreference) },
        { label: "License", value: licenseLabel(data) },
        { label: "Budget", value: budgetCapLabel(data) },
        { label: "Access", value: presetLabel(data.activePreset) ?? "Custom" },
        {
          label: "Rules",
          value:
            data.allowedPermissionCount != null
              ? String(data.allowedPermissionCount)
              : null,
        },
        { label: "Search", value: boolLabel(data.webSearchEnabled) },
        {
          label: "Channels",
          value: data.channelCount != null ? String(data.channelCount) : null,
        },
        { label: "Learning", value: boolLabel(data.autoPromoteSkills) },
      ]
    : [];

  return (
    <div
      // Sticky BELOW the telemetry rail (top = header + rail height). The
      // collapsed row is chrome, so its height is part of the sticky stack; the
      // expanded panel is a non-sticky block below it that pushes content.
      className="sticky top-[var(--chrome-glance-top)] z-[var(--z-rail)] flex-none border-b border-border"
      aria-label="Settings at a glance"
    >
      {/* Collapse bar: the SETTINGS toggle + a SINGLE "Settings" deep-link
          (per-tile links removed), then — only when collapsed — the LEFT-ALIGNED
          summary of compact cells with vertical dividers. When expanded the
          summary HIDES; the panel below carries the detail (no duplicates). */}
      <div className="glance-row flex items-stretch py-[5px]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse settings" : "Expand settings"}
          className="glance-cell flex flex-none items-center gap-1 px-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.1em]">
            Settings
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        <Link
          href="/settings"
          className="glance-cell flex flex-none items-center gap-0.5 px-4 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-primary"
        >
          Open
          <ArrowUpRight aria-hidden className="h-2.5 w-2.5" />
        </Link>
        {/* The collapsed summary is ALWAYS in the DOM (toggled via `hidden`,
            not conditionally unmounted) so the OPEN cell is consistently NOT the
            row's last child. Conditionally rendering this container made OPEN
            flip to :last-child on expand, and the mount/unmount on toggle
            flashed OPEN's divider for a frame ("brief vertical bar" on
            collapse). Keeping it mounted keeps the divider state stable. */}
        <div
          className={cn(
            "flex flex-1 items-center overflow-x-auto",
            expanded && "hidden",
          )}
        >
          {data == null ? (
            <span className="flex items-center px-4 font-mono text-xs text-muted-foreground/50">
              —
            </span>
          ) : (
            chips.map((c) => (
              <Cell key={c.label} label={c.label} value={c.value} />
            ))
          )}
        </div>
      </div>

      {/* Expanded panel — ONE horizontal row of labeled groups (like the
          telemetry cell strip), each group a header + a sub-row of compact
          cells, separated by a divider. Does not wrap; scrolls on a narrow
          viewport. Runtime is split into two groups (active runtime vs the SDK
          execution limits). */}
      {expanded && data != null && (
        <div className="glance-panel flex items-start overflow-x-auto border-t border-border py-3">
          <Group
            icon={<Cpu aria-hidden />}
            title="Runtime"
            cells={[
              { label: "Runtime", value: data.activeRuntimeLabel },
              { label: "Model", value: data.activeModel },
              { label: "Routing", value: routingLabel(data.routingPreference) },
              {
                label: "Configured",
                value:
                  data.configuredRuntimeCount != null
                    ? `${data.configuredRuntimeCount} runtimes`
                    : null,
              },
            ]}
          />
          <Group
            icon={<Gauge aria-hidden />}
            title="Execution"
            cells={[
              {
                label: "Timeout",
                value:
                  data.sdkTimeoutSeconds != null
                    ? `${data.sdkTimeoutSeconds}s`
                    : null,
              },
              {
                label: "Max turns",
                value: data.maxTurns != null ? String(data.maxTurns) : null,
              },
            ]}
          />
          <Group
            icon={<Wallet aria-hidden />}
            title="Budget"
            cells={[
              { label: "License", value: licenseLabel(data) },
              { label: "Monthly cap", value: budgetCapLabel(data) ?? "None set" },
            ]}
          />
          <Group
            icon={<ShieldCheck aria-hidden />}
            title="Permissions"
            cells={[
              { label: "Preset", value: presetLabel(data.activePreset) ?? "Custom" },
              {
                label: "Allowed",
                value:
                  data.allowedPermissionCount != null
                    ? `${data.allowedPermissionCount} rules`
                    : null,
              },
            ]}
          />
          <Group
            icon={<Plug aria-hidden />}
            title="Integrations"
            cells={[
              { label: "Web search", value: boolLabel(data.webSearchEnabled) },
              {
                label: "Channels",
                value:
                  data.channelCount != null ? String(data.channelCount) : null,
              },
              { label: "Skill learning", value: boolLabel(data.autoPromoteSkills) },
            ]}
          />
        </div>
      )}
    </div>
  );
}

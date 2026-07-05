"use client";

// FEAT-14 — Settings at a glance (WS4, 2026-07-05).
// A two-level progressive-disclosure rail below the telemetry rail: a slim
// collapsed chip row of the key settings, expanding to a grouped panel
// (Runtime · Budget · Permissions · Integrations). Read-only summary — edits
// stay on /settings; each group deep-links there. Data comes from one
// consolidated read (useSettingsGlance → /api/settings/glance); shadow-path
// discipline throughout — only resolved fields render, a failed read collapses
// the rail to nothing.

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Cpu,
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

// A single value chip in the collapsed row: mono micro-label over a value,
// matching the telemetry rail's density. Renders nothing when value is null so
// the row only shows what resolved.
function Chip({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (value == null) return null;
  return (
    <div className="flex flex-none items-baseline gap-1.5">
      <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// A read-only value pill inside an expanded group tile (zone 4).
function Pill({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null;
  return (
    <div className="glance-pill flex items-baseline justify-between gap-3 px-0.5 py-1">
      <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// A labeled group tile (zone 3) with a "Settings" deep-link.
function GroupTile({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glance-tile flex flex-col gap-1.5 rounded-md p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span className="flex h-3 w-3 items-center justify-center [&_svg]:h-3 [&_svg]:w-3">
            {icon}
          </span>
          {title}
        </div>
        <Link
          href={href}
          className="flex items-center gap-0.5 text-[0.6rem] text-muted-foreground transition-colors hover:text-primary"
        >
          Settings
          <ArrowUpRight aria-hidden className="h-2.5 w-2.5" />
        </Link>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
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
      {/* Collapsed row: the SETTINGS toggle + (only when collapsed) the dense
          chip summary. When expanded the chips HIDE — the panel below carries
          the detail, so no duplicate summaries (#6). The toggle stays as the
          panel header. */}
      <div className="glance-row flex h-8 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse settings" : "Expand settings"}
          className="flex flex-none items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground"
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
        {!expanded &&
          (data == null ? (
            <span className="font-mono text-xs text-muted-foreground/50">—</span>
          ) : (
            // flex-1 + justify-between spreads the chips across the full rail
            // width instead of left-packing a few (#4).
            <div className="flex flex-1 items-center justify-between gap-3 overflow-x-auto">
              {chips.map((c) => (
                <Chip key={c.label} label={c.label} value={c.value} />
              ))}
            </div>
          ))}
      </div>

      {/* Expanded panel — four grouped tiles, each dense with every resolved
          field for its cluster (#5). Same translucent chrome family as the row
          so it reads as one surface. */}
      {expanded && data != null && (
        <div className="glance-panel grid grid-cols-1 items-start gap-2 border-t border-border p-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <GroupTile icon={<Cpu aria-hidden />} title="Runtime" href="/settings">
            <Pill label="Runtime" value={data.activeRuntimeLabel} />
            <Pill label="Model" value={data.activeModel} />
            <Pill label="Routing" value={routingLabel(data.routingPreference)} />
            <Pill
              label="Configured"
              value={
                data.configuredRuntimeCount != null
                  ? `${data.configuredRuntimeCount} runtimes`
                  : null
              }
            />
            <Pill
              label="Timeout"
              value={
                data.sdkTimeoutSeconds != null
                  ? `${data.sdkTimeoutSeconds}s`
                  : null
              }
            />
            <Pill
              label="Max turns"
              value={data.maxTurns != null ? String(data.maxTurns) : null}
            />
          </GroupTile>
          <GroupTile icon={<Wallet aria-hidden />} title="Budget" href="/settings">
            <Pill label="License" value={licenseLabel(data)} />
            <Pill label="Monthly cap" value={budgetCapLabel(data) ?? "None set"} />
          </GroupTile>
          <GroupTile
            icon={<ShieldCheck aria-hidden />}
            title="Permissions"
            href="/settings"
          >
            <Pill label="Preset" value={presetLabel(data.activePreset) ?? "Custom"} />
            <Pill
              label="Allowed"
              value={
                data.allowedPermissionCount != null
                  ? `${data.allowedPermissionCount} rules`
                  : null
              }
            />
          </GroupTile>
          <GroupTile icon={<Plug aria-hidden />} title="Integrations" href="/settings">
            <Pill label="Web search" value={boolLabel(data.webSearchEnabled)} />
            <Pill
              label="Channels"
              value={
                data.channelCount != null ? String(data.channelCount) : null
              }
            />
            <Pill label="Skill learning" value={boolLabel(data.autoPromoteSkills)} />
          </GroupTile>
        </div>
      )}
    </div>
  );
}

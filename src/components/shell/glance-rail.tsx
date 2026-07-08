"use client";

// FEAT-14 — Settings at a glance (WS4, 2026-07-05).
// A single compact rail below the telemetry rail, sharing its RailCell grammar
// (mono label over value, left-aligned, vertical dividers). Read-only — edits
// stay on /settings. Data comes from one consolidated read (useSettingsGlance →
// /api/settings/glance); shadow-path discipline throughout — only resolved
// fields render, a failed read collapses the rail to nothing.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
// (.glance-cell). Renders nothing when the value is null, so a row only shows
// what resolved.
type GlanceCell = { label: string; value: string | null; href?: string };

function Cell({ label, value, href }: GlanceCell) {
  if (value == null) return null;
  const content = (
    <>
      <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </>
  );
  const className =
    "glance-cell flex min-w-[7rem] flex-none flex-col gap-0.5 px-3 transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (href) {
    return (
      <Link href={href} aria-label={`Open ${label} settings`} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <div className="glance-cell flex min-w-[7rem] flex-none flex-col gap-0.5 px-3">
      {content}
    </div>
  );
}

// Derive the compact rail cells from a resolved payload. Values are formatted
// to null when their source field is null (shadow paths).
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

// Preset label with a "Custom" fallback for the rail.
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

  // Failed first read (error + no last-good) → render nothing. The rail
  // collapses to zero height; no crash, no empty chrome band.
  if (glance.status === "error" && glance.data == null) return null;
  const data = glance.data;

  // Every resolved setting, dense, spanning the full rail width like the
  // telemetry rail. Cells render null when their field is null, so the row only
  // shows what resolved. These include the former expanded-only execution and
  // permission cells so no second settings rail is required.
  const chips: GlanceCell[] = data
    ? [
        { label: "Model", value: data.activeModel, href: "/settings#settings-providers" },
        { label: "Runtime", value: data.activeRuntimeLabel, href: "/settings#settings-providers" },
        {
          label: "Routing",
          value: routingLabel(data.routingPreference),
          href: "/settings#settings-providers",
        },
        {
          label: "Configured",
          value:
            data.configuredRuntimeCount != null
              ? `${data.configuredRuntimeCount} runtimes`
              : null,
          href: "/settings#settings-providers",
        },
        {
          label: "Timeout",
          value:
            data.sdkTimeoutSeconds != null
              ? `${data.sdkTimeoutSeconds}s`
              : null,
          href: "/settings#settings-runtime",
        },
        {
          label: "Max turns",
          value: data.maxTurns != null ? String(data.maxTurns) : null,
          href: "/settings#settings-runtime",
        },
        { label: "License", value: licenseLabel(data), href: "/settings#settings-license" },
        { label: "Budget", value: budgetCapLabel(data), href: "/settings#settings-budget" },
        {
          label: "Preset",
          value: presetLabel(data.activePreset) ?? "Custom",
          href: "/settings#settings-permissions",
        },
        {
          label: "Rules",
          value:
            data.allowedPermissionCount != null
              ? String(data.allowedPermissionCount)
              : null,
          href: "/settings#settings-permissions",
        },
        {
          label: "Search",
          value: boolLabel(data.webSearchEnabled),
          href: "/settings#settings-web-search",
        },
        {
          label: "Channels",
          value: data.channelCount != null ? String(data.channelCount) : null,
          href: "/settings#settings-channels",
        },
        {
          label: "Learning",
          value: boolLabel(data.autoPromoteSkills),
          href: "/settings#settings-learning",
        },
      ]
    : [];

  return (
    <div
      // Sticky BELOW the telemetry rail (top = header + rail height). The
      // row is chrome, so its height is part of the sticky stack.
      className="sticky top-[var(--chrome-glance-top)] z-[var(--z-rail)] flex-none border-b border-border"
      aria-label="Settings at a glance"
    >
      <div className="glance-row flex items-stretch py-[5px]">
        <div className="glance-cell flex flex-none items-center gap-1 px-4 text-muted-foreground">
          <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.1em]">
            Settings
          </span>
        </div>
        <Link
          href="/settings"
          className="glance-cell flex flex-none items-center gap-0.5 px-4 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-primary"
        >
          Open
          <ArrowUpRight aria-hidden className="h-2.5 w-2.5" />
        </Link>
        <div className="flex flex-1 items-center overflow-x-auto">
          {data == null ? (
            <span className="flex items-center px-4 font-mono text-xs text-muted-foreground/50">
              —
            </span>
          ) : (
            chips.map((c) => (
              <Cell key={c.label} {...c} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

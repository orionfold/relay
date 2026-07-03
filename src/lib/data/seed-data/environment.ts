import { homedir } from "os";
import { join } from "path";

export interface EnvironmentScanSeed {
  id: string;
  projectId: string | null;
  scanPath: string;
  persona: string; // JSON array of ToolPersona
  scanStatus: "running" | "completed" | "failed";
  artifactCount: number;
  durationMs: number;
  errors: string | null; // JSON
  scannedAt: Date;
  createdAt: Date;
}

export interface EnvironmentArtifactSeed {
  id: string;
  scanId: string;
  tool: "claude-code" | "codex" | "shared";
  category:
    | "skill"
    | "plugin"
    | "hook"
    | "mcp-server"
    | "permission"
    | "instruction"
    | "memory"
    | "rule"
    | "reference"
    | "output-style";
  scope: "user" | "project";
  name: string;
  relPath: string;
  absPath: string;
  contentHash: string;
  preview: string;
  metadata: string; // JSON
  sizeBytes: number;
  modifiedAt: number; // epoch ms
  linkedProfileId: string | null;
  createdAt: Date;
}

export interface EnvironmentCheckpointSeed {
  id: string;
  projectId: string | null;
  label: string;
  checkpointType: "pre-sync" | "manual" | "pre-onboard";
  gitTag: string | null;
  gitCommitSha: string | null;
  backupPath: string | null;
  filesCount: number;
  status: "active" | "rolled_back" | "superseded";
  createdAt: Date;
}

export interface EnvironmentTemplateSeed {
  id: string;
  name: string;
  description: string;
  manifest: string; // JSON
  scope: "user" | "shared";
  artifactCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const HOME = homedir();

function sampleHash(seed: string): string {
  // Deterministic-looking hex string; not cryptographic — just for UI preview.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return (hex + hex + hex + hex).slice(0, 40);
}

/**
 * Seed the environment/workspace-discovery surface: a completed scan with
 * artifacts across Claude Code + Codex personas, plus checkpoints and
 * templates for the sync/rollback and capture flows.
 */
export function createEnvironment(projectIds: string[]): {
  scans: EnvironmentScanSeed[];
  artifacts: EnvironmentArtifactSeed[];
  checkpoints: EnvironmentCheckpointSeed[];
  templates: EnvironmentTemplateSeed[];
} {
  const now = Date.now();
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const [p1, p2] = projectIds;

  const scan1Id = crypto.randomUUID();
  const scan2Id = crypto.randomUUID();

  const scans: EnvironmentScanSeed[] = [
    {
      id: scan1Id,
      projectId: p1 ?? null,
      scanPath: join(HOME, "Developer", "ainative"),
      persona: JSON.stringify(["claude-code", "codex", "shared"]),
      scanStatus: "completed",
      artifactCount: 14,
      durationMs: 812,
      errors: null,
      scannedAt: new Date(now - 3 * HOUR),
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: scan2Id,
      projectId: p2 ?? null,
      scanPath: join(HOME, "Developer", "content-engine"),
      persona: JSON.stringify(["claude-code"]),
      scanStatus: "completed",
      artifactCount: 6,
      durationMs: 421,
      errors: null,
      scannedAt: new Date(now - 2 * DAY),
      createdAt: new Date(now - 2 * DAY),
    },
  ];

  const claudeProjectPath = join(HOME, "Developer", "ainative", ".claude");
  const codexProjectPath = join(HOME, "Developer", "ainative", ".codex");
  const claudeUserPath = join(HOME, ".claude");
  const codexUserPath = join(HOME, ".codex");

  const artifacts: EnvironmentArtifactSeed[] = [
    // ── Claude Code — project scope ─────────────────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "skill",
      scope: "project",
      name: "superpowers:brainstorming",
      relPath: ".claude/skills/brainstorming/SKILL.md",
      absPath: join(claudeProjectPath, "skills", "brainstorming", "SKILL.md"),
      contentHash: sampleHash("brainstorming-skill"),
      preview:
        "You MUST use this before any creative work — creating features, building components, adding functionality, or modifying behavior...",
      metadata: JSON.stringify({
        description: "Explores user intent, requirements and design before implementation",
      }),
      sizeBytes: 4_820,
      modifiedAt: now - 6 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "skill",
      scope: "project",
      name: "refresh-content-pipeline",
      relPath: ".claude/skills/refresh-content-pipeline/SKILL.md",
      absPath: join(claudeProjectPath, "skills", "refresh-content-pipeline", "SKILL.md"),
      contentHash: sampleHash("refresh-pipeline"),
      preview:
        "Change-aware orchestrator that refreshes all code-derived content (screengrabs, docs, user guide, README...)",
      metadata: JSON.stringify({
        description: "Full content pipeline refresh orchestrator",
      }),
      sizeBytes: 3_010,
      modifiedAt: now - 4 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "instruction",
      scope: "project",
      name: "CLAUDE.md",
      relPath: "CLAUDE.md",
      absPath: join(HOME, "Developer", "ainative", "CLAUDE.md"),
      contentHash: sampleHash("claude-md"),
      preview:
        "# Claude Code Guide — This file is the Claude Agent SDK's project setting source. Edit AGENTS.md first, then mirror here...",
      metadata: JSON.stringify({ lines: 118 }),
      sizeBytes: 7_248,
      modifiedAt: now - 1 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "mcp-server",
      scope: "project",
      name: "context7",
      relPath: ".claude/settings.json",
      absPath: join(claudeProjectPath, "settings.json"),
      contentHash: sampleHash("mcp-context7"),
      preview:
        "{\n  \"mcpServers\": {\n    \"context7\": { \"command\": \"npx\", \"args\": [\"-y\", \"@upstash/context7-mcp\"] }\n  }\n}",
      metadata: JSON.stringify({ server: "context7", args: 3 }),
      sizeBytes: 612,
      modifiedAt: now - 8 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "hook",
      scope: "project",
      name: "pre-commit lint",
      relPath: ".claude/settings.json",
      absPath: join(claudeProjectPath, "settings.json"),
      contentHash: sampleHash("hook-precommit"),
      preview: "{ \"event\": \"PreToolUse\", \"matcher\": \"Edit|Write\", \"command\": \"npm run lint:fix\" }",
      metadata: JSON.stringify({ event: "PreToolUse" }),
      sizeBytes: 244,
      modifiedAt: now - 5 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "permission",
      scope: "project",
      name: "allow npm + bash",
      relPath: ".claude/settings.local.json",
      absPath: join(claudeProjectPath, "settings.local.json"),
      contentHash: sampleHash("perm-allow"),
      preview: "{ \"permissions\": { \"allow\": [\"Bash(npm *)\", \"Bash(npx *)\", \"Bash(git status*)\"] } }",
      metadata: JSON.stringify({ allowCount: 3 }),
      sizeBytes: 198,
      modifiedAt: now - 12 * HOUR,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },

    // ── Claude Code — user scope ─────────────────────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "skill",
      scope: "user",
      name: "skill-creator",
      relPath: ".claude/skills/skill-creator/SKILL.md",
      absPath: join(claudeUserPath, "skills", "skill-creator", "SKILL.md"),
      contentHash: sampleHash("skill-creator"),
      preview:
        "Create new skills, modify and improve existing skills, and measure skill performance...",
      metadata: JSON.stringify({ description: "Skill lifecycle management" }),
      sizeBytes: 5_840,
      modifiedAt: now - 10 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "claude-code",
      category: "memory",
      scope: "user",
      name: "MEMORY.md",
      relPath: ".claude/projects/.../memory/MEMORY.md",
      absPath: join(claudeUserPath, "projects", "relay", "memory", "MEMORY.md"),
      contentHash: sampleHash("memory-md"),
      preview:
        "# Relay Project Memory: Project State, Environment, Design System, Key Architecture Decisions...",
      metadata: JSON.stringify({ lines: 180 }),
      sizeBytes: 12_400,
      modifiedAt: now - 1 * HOUR,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },

    // ── Codex — project scope ────────────────────────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "codex",
      category: "skill",
      scope: "project",
      name: "app-server-integration",
      relPath: ".codex/skills/app-server-integration/SKILL.md",
      absPath: join(codexProjectPath, "skills", "app-server-integration", "SKILL.md"),
      contentHash: sampleHash("codex-app-server"),
      preview:
        "Integrate Codex App Server via WebSocket JSON-RPC. Use cwd-scoped skill discovery...",
      metadata: JSON.stringify({ runtime: "codex-app-server" }),
      sizeBytes: 2_340,
      modifiedAt: now - 3 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "codex",
      category: "instruction",
      scope: "project",
      name: "AGENTS.md",
      relPath: "AGENTS.md",
      absPath: join(HOME, "Developer", "ainative", "AGENTS.md"),
      contentHash: sampleHash("agents-md"),
      preview:
        "# Multi-Agent Repo Guide — Shared operating conventions for Claude Code, Codex, and Gemini CLI...",
      metadata: JSON.stringify({ lines: 212 }),
      sizeBytes: 9_120,
      modifiedAt: now - 1 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },

    // ── Codex — user scope ───────────────────────────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "codex",
      category: "skill",
      scope: "user",
      name: "imagegen",
      relPath: ".codex/skills/imagegen/SKILL.md",
      absPath: join(codexUserPath, "skills", "imagegen", "SKILL.md"),
      contentHash: sampleHash("imagegen"),
      preview:
        "Generate images with OpenAI DALL-E 3. Best for quick hero visuals and illustrations...",
      metadata: JSON.stringify({ provider: "openai" }),
      sizeBytes: 2_160,
      modifiedAt: now - 18 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "codex",
      category: "rule",
      scope: "user",
      name: "config.toml",
      relPath: ".codex/config.toml",
      absPath: join(codexUserPath, "config.toml"),
      contentHash: sampleHash("codex-config"),
      preview:
        "[model]\nname = \"gpt-5.4\"\nreasoning = \"high\"\n\n[trust]\ndirs = [\"~/Developer\"]",
      metadata: JSON.stringify({ reasoning: "high" }),
      sizeBytes: 410,
      modifiedAt: now - 22 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },

    // ── Shared ───────────────────────────────────────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "shared",
      category: "reference",
      scope: "project",
      name: "developers-openai-com-codex-sdk",
      relPath: ".claude/reference/developers-openai-com-codex-sdk/",
      absPath: join(claudeProjectPath, "reference", "developers-openai-com-codex-sdk"),
      contentHash: sampleHash("codex-sdk-docs"),
      preview:
        "Reference library for the Codex SDK — JSON-RPC, app-server, skill discovery, thread lifecycle...",
      metadata: JSON.stringify({ fileCount: 18 }),
      sizeBytes: 183_200,
      modifiedAt: now - 24 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: crypto.randomUUID(),
      scanId: scan1Id,
      tool: "shared",
      category: "output-style",
      scope: "user",
      name: "explanatory",
      relPath: ".claude/output-styles/explanatory.md",
      absPath: join(claudeUserPath, "output-styles", "explanatory.md"),
      contentHash: sampleHash("output-style-expl"),
      preview:
        "Balance educational content with task completion — provide helpful explanations while remaining focused...",
      metadata: JSON.stringify({ wordLimit: "flexible" }),
      sizeBytes: 784,
      modifiedAt: now - 40 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 3 * HOUR),
    },

    // ── Scan 2 artifacts (smaller, just skills) ───────────────────────
    {
      id: crypto.randomUUID(),
      scanId: scan2Id,
      tool: "claude-code",
      category: "skill",
      scope: "project",
      name: "content-production",
      relPath: ".claude/skills/content-production/SKILL.md",
      absPath: join(HOME, "Developer", "content-engine", ".claude", "skills", "content-production", "SKILL.md"),
      contentHash: sampleHash("content-production"),
      preview:
        "Runs the editorial pipeline from keyword research through publication and distribution...",
      metadata: JSON.stringify({ usedBy: "content-cycle workflow" }),
      sizeBytes: 1_840,
      modifiedAt: now - 6 * DAY,
      linkedProfileId: null,
      createdAt: new Date(now - 2 * DAY),
    },
  ];

  const checkpoints: EnvironmentCheckpointSeed[] = [
    {
      id: crypto.randomUUID(),
      projectId: p1 ?? null,
      label: "Pre-sync: pull shared skills v1.3",
      checkpointType: "pre-sync",
      gitTag: "relay/checkpoint/pre-sync-2026-04-15",
      gitCommitSha: "8f170e045d3c4b7a9e2f1c0d8b4a6c5e7d9f2a3b",
      backupPath: join(HOME, ".relay", "checkpoints", "pre-sync-2026-04-15.tar.gz"),
      filesCount: 14,
      status: "active",
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: crypto.randomUUID(),
      projectId: p1 ?? null,
      label: "Manual: before CLAUDE.md rewrite",
      checkpointType: "manual",
      gitTag: "relay/checkpoint/claude-md-rewrite",
      gitCommitSha: "3279aa3c9d0b1a2e3f4d5c6b7a8f9e0d1c2b3a4f",
      backupPath: join(HOME, ".relay", "checkpoints", "manual-claude-md.tar.gz"),
      filesCount: 3,
      status: "superseded",
      createdAt: new Date(now - 6 * DAY),
    },
    {
      id: crypto.randomUUID(),
      projectId: p2 ?? null,
      label: "Pre-onboard: Content Engine clone",
      checkpointType: "pre-onboard",
      gitTag: null,
      gitCommitSha: null,
      backupPath: join(HOME, ".relay", "checkpoints", "pre-onboard-content.tar.gz"),
      filesCount: 21,
      status: "active",
      createdAt: new Date(now - 14 * DAY),
    },
  ];

  const templates: EnvironmentTemplateSeed[] = [
    {
      id: crypto.randomUUID(),
      name: "Solo Founder Starter",
      description:
        "Skills + hooks + MCP config for a solo-founder workspace: GTM, content, and customer success primitives.",
      manifest: JSON.stringify({
        skills: ["brainstorming", "content-production", "customer-success"],
        mcpServers: ["context7", "claude-in-chrome"],
        permissions: { allow: ["Bash(npm *)", "WebSearch", "Read"] },
        instructions: ["CLAUDE.md", "AGENTS.md"],
      }),
      scope: "shared",
      artifactCount: 9,
      createdAt: new Date(now - 30 * DAY),
      updatedAt: new Date(now - 5 * DAY),
    },
    {
      id: crypto.randomUUID(),
      name: "Agency Delivery Pack",
      description:
        "Multi-client workspace template with project-scoped skills, client-branded instructions, and delivery-channel configs.",
      manifest: JSON.stringify({
        skills: ["due-diligence", "content-production", "revenue-ops"],
        mcpServers: ["context7"],
        permissions: { allow: ["Read", "Write", "Grep", "WebSearch"] },
        instructions: ["CLAUDE.md"],
      }),
      scope: "shared",
      artifactCount: 7,
      createdAt: new Date(now - 18 * DAY),
      updatedAt: new Date(now - 3 * DAY),
    },
    {
      id: crypto.randomUUID(),
      name: "Personal Research Kit",
      description:
        "User-scope template for long-form research and writing with skill-creator, capture, and refer skills pre-configured.",
      manifest: JSON.stringify({
        skills: ["skill-creator", "capture", "refer"],
        mcpServers: ["context7", "claude-in-chrome"],
        permissions: { allow: ["Read", "WebSearch"] },
        instructions: [],
      }),
      scope: "user",
      artifactCount: 5,
      createdAt: new Date(now - 10 * DAY),
      updatedAt: new Date(now - 1 * DAY),
    },
  ];

  return { scans, artifacts, checkpoints, templates };
}

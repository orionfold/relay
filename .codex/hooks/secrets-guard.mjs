#!/usr/bin/env node
/**
 * Dependency-free PreToolUse secrets guard for Relay.
 *
 * Contract:
 * - stdin: JSON with { tool_name, tool_input }
 * - exit 0: allow
 * - exit 2: block; stderr explains why
 *
 * Node is Relay's only required scripting runtime, so this file works in a
 * fresh clone on supported macOS and Windows hosts without a Python install.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SECRET_PATTERNS = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style API key", /\bsk-[A-Za-z0-9]{20,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  [
    "Supabase service-role/JWT key",
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  ],
  ["Bearer token", /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i],
];

const ASSIGNMENT_PATTERN =
  /\b[A-Za-z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?KEY|PASSWORD)\b\s*[=:]\s*['"]?([^\s'"]{16,})['"]?/gi;

const PLACEHOLDER = /^(?:\$?\{?[A-Z0-9_]*(?:ENV|VAR|PLACEHOLDER)[A-Z0-9_]*\}?|os\.environ.*|getenv.*|process\.env.*|your[-_].*|example.*|changeme.*|placeholder.*|xxx+.*|\.\.\.+|<[^>]+>)$/i;

export function findSecret(text) {
  if (!text) return null;

  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) return `${label} detected`;
  }

  for (const match of text.matchAll(ASSIGNMENT_PATTERN)) {
    const value = match[1];
    if (!PLACEHOLDER.test(value)) {
      return "a secret-named field assigned a literal value";
    }
  }

  return null;
}

export function checkBash(command) {
  if (/\bgit\s+add\b[^\n|&;]*\.env/i.test(command)) {
    return "git add of a .env file";
  }
  if (/\bgit\s+commit\b[^\n|&;]*\.env/i.test(command)) {
    return "git commit referencing a .env file";
  }
  return findSecret(command);
}

export function evaluatePayload(payload) {
  const tool = payload?.tool_name ?? "";
  const input = payload?.tool_input ?? {};

  if (tool === "Write") return findSecret(input.content ?? "");
  if (tool === "Edit") return findSecret(input.new_string ?? "");
  if (tool === "Bash") return checkBash(input.command ?? "");
  return null;
}

export function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }

  const reason = evaluatePayload(payload);
  if (!reason) return 0;

  process.stderr.write(
    `BLOCKED by secrets-guard: ${reason}. ` +
      "Secrets must never be written into code, commits, screenshots, or the " +
      "SDK subprocess env (Relay prime directive). Reference real keys through " +
      "an environment variable or .env.local and keep them out of tracked files. " +
      "The Agent SDK subprocess env must strip ANTHROPIC_API_KEY for OAuth mode; " +
      "do not re-introduce a literal key there.\n",
  );
  return 2;
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = main();
}

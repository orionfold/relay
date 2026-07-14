import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkBash, evaluatePayload, findSecret } from "./secrets-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = join(here, "secrets-guard.mjs");

function token(...parts) {
  return parts.join("");
}

function runHook(payload) {
  return spawnSync(process.execPath, [guardPath], {
    encoding: "utf8",
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

test("allows empty, malformed, placeholder, and environment-reference input", () => {
  assert.equal(findSecret(""), null);
  assert.equal(findSecret("OPENAI_API_KEY=process.env.OPENAI_API_KEY"), null);
  assert.equal(findSecret("API_TOKEN=<your-token-here>"), null);
  assert.equal(runHook("").status, 0);
  assert.equal(runHook("not-json").status, 0);
});

test("detects provider tokens and generic secret assignments", () => {
  assert.equal(
    findSecret(token("sk", "-ant-", "A".repeat(24))),
    "Anthropic API key detected",
  );
  assert.equal(
    findSecret(token("gh", "p_", "b".repeat(32))),
    "GitHub token detected",
  );
  assert.equal(
    findSecret(token("DATABASE_PASS", "WORD=", "correct-horse-battery")),
    "a secret-named field assigned a literal value",
  );
});

test("blocks .env staging but permits ordinary git commands", () => {
  assert.equal(checkBash("git add .env.local"), "git add of a .env file");
  assert.equal(
    checkBash("git commit .env.production -m unsafe"),
    "git commit referencing a .env file",
  );
  assert.equal(checkBash("git add README.md && git commit -m docs"), null);
});

test("routes Write, Edit, and Bash payloads through the same guard", () => {
  const secret = token("sk", "-", "Z".repeat(24));
  assert.equal(
    evaluatePayload({ tool_name: "Write", tool_input: { content: secret } }),
    "OpenAI-style API key detected",
  );
  assert.equal(
    evaluatePayload({ tool_name: "Edit", tool_input: { new_string: secret } }),
    "OpenAI-style API key detected",
  );
  assert.equal(
    evaluatePayload({ tool_name: "Bash", tool_input: { command: "git add .env" } }),
    "git add of a .env file",
  );
  assert.equal(evaluatePayload({ tool_name: "Read", tool_input: {} }), null);
});

test("CLI exits 2 with a named block reason and 0 for safe input", () => {
  const blocked = runHook({
    tool_name: "Write",
    tool_input: { content: token("sk", "-ant-", "A".repeat(24)) },
  });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /BLOCKED by secrets-guard: Anthropic API key detected/);

  const allowed = runHook({
    tool_name: "Write",
    tool_input: { content: "OPENAI_API_KEY=process.env.OPENAI_API_KEY" },
  });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stderr, "");
});

test("tracked hook command uses only Node and a shell-neutral relative path", () => {
  const config = JSON.parse(readFileSync(join(here, "..", "hooks.json"), "utf8"));
  const command = config.hooks.PreToolUse[0].hooks[0].command;
  assert.equal(command, "node .codex/hooks/secrets-guard.mjs");
  assert.doesNotMatch(command, /python|bash|sh\s/i);
});

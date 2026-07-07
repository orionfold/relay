# Codex Browser Runbook

This runbook is the project rule for Codex Desktop browser work in Relay. It replaces the older
"always use visible Chrome" habit, which is too brittle when Codex has no structured access to that
browser.

## Decision Tree

1. **Unauthenticated localhost, file-backed, or public pages:** use the Codex in-app Browser /
   Browser plugin first. It is the default path for local UI verification because Codex can inspect
   rendered state, take screenshots, and interact without depending on the operator's Chrome profile.
2. **Signed-in pages, existing browser state, Chrome extensions, or profile cookies:** use the
   Codex Chrome extension / Chrome plugin. Before relying on it, confirm the extension is connected,
   the Chrome plugin is enabled for the thread, and the visible Chrome window is in the same profile.
3. **Desktop-app or visual-only GUI work:** use Computer Use, with a narrow task scope. This is for
   cases where files, commands, the in-app Browser, or the Chrome extension cannot expose the state.
4. **CDP, performance, network, or DevTools-level debugging:** use Chrome DevTools MCP against an
   isolated debug browser. Do not attach CDP tooling to the operator's everyday Chrome profile.
5. **Headless browser artifacts:** use Playwright or Chrome for Testing when an artifact requires a
   headless browser. Do not launch the normal macOS Google Chrome binary headless from Codex unless
   the operator explicitly requests it.

## Chrome DevTools MCP Setup

Use Chrome DevTools MCP only when the task actually needs DevTools/CDP behavior. For Relay localhost
UI checks, the in-app Browser is the default.

Preferred MCP modes:

- New isolated MCP browser: configure `chrome-devtools-mcp` with `--isolated`, or provide a temporary
  `--userDataDir` under `/tmp`.
- Existing debug browser: launch Chrome with both a remote-debugging port and a non-default data dir,
  then connect the MCP server with `--browser-url=http://127.0.0.1:9222`.

macOS debug-browser example:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/relay-codex-chrome-profile
```

Then verify the endpoint before using MCP:

```bash
curl http://127.0.0.1:9222/json/version
```

The response should include a `webSocketDebuggerUrl`.

## Anti-Patterns

- Do not default to `open -a "Google Chrome" <url>` as the only verification path. It can show the
  operator a page, but Codex cannot reliably inspect or click it unless Chrome-control tooling is
  connected.
- Do not keep retrying Chrome DevTools tools after a `DevToolsActivePort` or "cannot connect" error.
  Pick the intended path instead: in-app Browser for ordinary localhost, Chrome extension for signed-in
  Chrome state, or isolated Chrome DevTools MCP for CDP.
- Do not use remote debugging against the default Chrome profile. Chrome 136+ rejects this for
  `--remote-debugging-port`/`--remote-debugging-pipe`, and the security risk is real even on localhost.
- Do not launch the normal Google Chrome app directly in headless mode from Codex for Relay UI checks.
  It has crashed operator Chrome in prior sessions and is not the customer-visible path.

## Recovery Checklist

When browser control fails:

1. Identify the actual need: visual localhost check, signed-in Chrome state, GUI control, or DevTools
   debugging.
2. For localhost/public pages, switch to the in-app Browser / Browser plugin.
3. For signed-in Chrome pages, confirm the Codex Chrome extension says connected, Chrome plugin is on,
   the same Chrome profile is active, then try a new thread or restart/reinstall per OpenAI guidance.
4. For DevTools MCP, start an isolated debug Chrome and confirm `/json/version` before invoking MCP.
5. If sandboxed `curl` cannot reach a local dev server but the server is important to verification,
   rerun the command with Codex sandbox escalation instead of treating the app as broken.

## Sources

- OpenAI Codex in-app Browser docs: https://developers.openai.com/codex/app/browser
- OpenAI Codex Chrome extension docs: https://developers.openai.com/codex/app/chrome-extension
- OpenAI Codex Computer Use docs: https://developers.openai.com/codex/app/computer-use
- OpenAI Codex MCP docs: https://developers.openai.com/codex/mcp
- OpenAI Codex approvals and sandboxing docs: https://developers.openai.com/codex/agent-approvals-security
- Chrome DevTools MCP README: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Chrome remote debugging security update: https://developer.chrome.com/blog/remote-debugging-port

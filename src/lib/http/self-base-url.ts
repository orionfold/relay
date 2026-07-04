/**
 * Base URL for Relay's internal loopback self-calls (server → its OWN API).
 *
 * Several server-side paths call Relay's own HTTP API — the table-trigger
 * dispatcher fires `POST /api/tasks` / `/api/workflows/:id/execute`, and the
 * compose chat tools hit `/api/tables/:id/triggers`, `/export`, `/templates`,
 * etc. These are loopback self-fetches, so the origin must be *this* server's
 * own address, not a hardcoded one.
 *
 * The bug this fixes: the old fallback was a bare `http://localhost:3000`, which
 * silently broke every instance NOT on port 3000 (`--port`, `--hostname
 * 0.0.0.0`, containers, staging on :3199). The CLI sets neither `NEXTAUTH_URL`
 * nor `NEXT_PUBLIC_APP_URL`, so that fallback was always used → `TypeError:
 * fetch failed`, caught + swallowed to a server-log line, zero user-facing
 * signal (issue #29). See memory `self-http-calls-hardcode-3000`.
 *
 * Precedence:
 *   1. `RELAY_SELF_BASE_URL` — explicit override the CLI threads from the known
 *      bind port (loopback host + real port).
 *   2. `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` — reverse-proxy / custom-origin
 *      escape hatch (unchanged behavior for those deployments).
 *   3. `http://127.0.0.1:${PORT}` — loopback + the real port. The server always
 *      listens on loopback even when bound to `0.0.0.0` (INADDR_ANY includes the
 *      loopback interface), so a self-call must target 127.0.0.1, never the LAN
 *      IP or `0.0.0.0`. `PORT` is already in the child env (`bin/cli.ts`).
 *   4. `http://127.0.0.1:3000` — last-resort default when even `PORT` is absent.
 *
 * ZERO-IMPORT LEAF: this module reads only `process.env` and does string work.
 * It is imported by `table-tools.ts`, which is reachable from the runtime
 * catalog — a non-leaf import here would risk the module-load cycle the
 * smoke-budget rule guards. Keep it import-free. See memory
 * `shared-constant-zero-import-leaf`.
 */
export function getSelfBaseUrl(): string {
  const explicit =
    process.env.RELAY_SELF_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}`;
}

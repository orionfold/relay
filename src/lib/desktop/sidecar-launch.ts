import { existsSync } from "fs";
import { dirname, join } from "path";

export const SIDECAR_LOOPBACK_HOST = "127.0.0.1";

export function wasPortExplicitlyRequested(argv: string[]): boolean {
  return argv.some(
    (argument) =>
      argument === "-p" ||
      argument === "--port" ||
      argument.startsWith("--port="),
  );
}

export async function resolveSidecarPort({
  argv,
  requestedPort,
  findAvailablePort,
}: {
  argv: string[];
  requestedPort: number;
  findAvailablePort: (preferred: number) => Promise<number>;
}): Promise<number> {
  if (wasPortExplicitlyRequested(argv)) {
    return requestedPort;
  }

  return findAvailablePort(requestedPort);
}

function findClosestPath(
  cwd: string,
  segments: string[],
  exists: (targetPath: string) => boolean = existsSync,
): string | null {
  let dir = cwd;

  while (true) {
    const candidate = join(dir, ...segments);
    if (exists(candidate)) {
      return candidate;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }

    dir = parent;
  }
}

export function resolveNextEntrypoint(
  cwd: string,
  exists: (targetPath: string) => boolean = existsSync,
): string {
  const nextEntrypoint = findClosestPath(cwd, ["node_modules", "next", "dist", "bin", "next"], exists);
  if (nextEntrypoint) {
    return nextEntrypoint;
  }

  throw new Error(
    `Could not resolve Next.js CLI entrypoint from ${cwd}. Expected node_modules/next/dist/bin/next.`,
  );
}

export function buildNextLaunchArgs({
  isPrebuilt,
  port,
  host = SIDECAR_LOOPBACK_HOST,
}: {
  isPrebuilt: boolean;
  port: number;
  host?: string;
}): string[] {
  if (isPrebuilt) {
    return ["start", "--hostname", host, "--port", String(port)];
  }

  return ["dev", "--hostname", host, "--port", String(port)];
}

export function buildSidecarUrl(port: number, host = SIDECAR_LOOPBACK_HOST): string {
  return `http://${host}:${port}`;
}

/**
 * True when `host` is NOT a loopback address — i.e. binding to it exposes the
 * server beyond the local machine. Relay is local-first with light auth, so the
 * CLI warns before binding to such a host (`--hostname 0.0.0.0`, a LAN IP, a
 * hostname, etc.). This is an advisory gate, not access control, so it errs
 * toward warning: anything not provably loopback returns true.
 *
 * Loopback = `localhost`, IPv6 `::1`, or any `127.0.0.0/8` address (Linux lets
 * you bind e.g. `127.0.0.5`). `0.0.0.0` / `::` are INADDR_ANY ("all
 * interfaces") — the most exposing choice — and are treated as non-loopback.
 */
export function isNonLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === "localhost" || h === "::1") return false;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return false;
  return true;
}

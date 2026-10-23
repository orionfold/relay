/**
 * Headers for server-to-self HTTP calls. They carry the per-process internal
 * token when an authenticated exposure profile is active, and the operator's
 * API token when `RELAY_API_TOKEN` is set, so a self-call passes the same gate
 * as any other caller. Keep this a zero-import leaf: it is reachable from the
 * runtime catalog through chat table tools.
 */
export function getInternalAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = process.env.RELAY_INTERNAL_AUTH_TOKEN;
  if (token) headers["x-relay-internal-auth"] = token;
  const apiToken = process.env.RELAY_API_TOKEN;
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;
  return headers;
}

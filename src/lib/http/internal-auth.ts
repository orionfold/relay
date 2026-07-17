/**
 * Header for server-to-self HTTP calls when an authenticated exposure profile
 * is active. Keep this a zero-import leaf: it is reachable from the runtime
 * catalog through chat table tools.
 */
export function getInternalAuthHeaders(): Record<string, string> {
  const token = process.env.RELAY_INTERNAL_AUTH_TOKEN;
  return token ? { "x-relay-internal-auth": token } : {};
}

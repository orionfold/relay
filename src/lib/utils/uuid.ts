/**
 * Secure-context-safe UUID generation for client components.
 *
 * `crypto.randomUUID()` is only defined in a **secure context** — HTTPS or
 * `http://localhost`. When Relay runs on a remote VM accessed by a bare host
 * or LAN IP over plain HTTP (e.g. `http://10.0.0.231:3000`), the page is a
 * NON-secure context and `crypto.randomUUID` is `undefined`. Calling it there
 * throws `TypeError: crypto.randomUUID is not a function` — the crash reported
 * in issue #44 when clicking "New workflow".
 *
 * `crypto.getRandomValues()` IS available in non-secure contexts, so we build
 * an RFC-4122 v4 UUID from it. A final `Math.random()` tier keeps the helper
 * from ever throwing even in an exotic runtime with no `crypto` at all — an id
 * collision is survivable; a thrown error that kills the click handler is not
 * (engineering principle #1: zero silent failures, no user-facing crashes).
 *
 * Server code (Node) always has `crypto.randomUUID`; this helper is for the
 * client. Import it anywhere a `"use client"` module needs a stable id.
 */
export function randomId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;

  // Preferred: native UUID (secure contexts, and all Node).
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  // Non-secure context (plain-HTTP remote host): randomUUID is gone but
  // getRandomValues remains. Assemble an RFC-4122 v4 UUID by hand.
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // Set version (4) and variant (10xx) bits per RFC 4122 §4.4.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < 256; i++) {
      hex.push((i + 0x100).toString(16).slice(1));
    }
    return (
      hex[bytes[0]] +
      hex[bytes[1]] +
      hex[bytes[2]] +
      hex[bytes[3]] +
      "-" +
      hex[bytes[4]] +
      hex[bytes[5]] +
      "-" +
      hex[bytes[6]] +
      hex[bytes[7]] +
      "-" +
      hex[bytes[8]] +
      hex[bytes[9]] +
      "-" +
      hex[bytes[10]] +
      hex[bytes[11]] +
      hex[bytes[12]] +
      hex[bytes[13]] +
      hex[bytes[14]] +
      hex[bytes[15]]
    );
  }

  // Last-resort tier: no Web Crypto at all. Non-cryptographic, but never
  // throws — a UUID-shaped string is better than a crashed handler.
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += "-";
    } else if (i === 14) {
      out += "4";
    } else {
      const r = (Math.random() * 16) | 0;
      out += (i === 19 ? (r & 0x3) | 0x8 : r).toString(16);
    }
  }
  return out;
}

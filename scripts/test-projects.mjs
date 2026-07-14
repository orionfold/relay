export const DEFAULT_TEST_INCLUDE = [
  "src/**/__tests__/**/*.test.{ts,tsx}",
];

export const DOM_TEST_INCLUDE = [
  "src/components/**/__tests__/**/*.test.{ts,tsx}",
  "src/hooks/**/__tests__/**/*.test.{ts,tsx}",
  "src/lib/apps/view-kits/__tests__/integration/**/*.test.tsx",
];

export const BROWSER_TEST_INCLUDE = [
  "src/**/__tests__/**/*.browser.test.{ts,tsx}",
];

export const E2E_TEST_INCLUDE = ["src/__tests__/e2e/**/*.test.ts"];

export function classifyTestFile(candidate) {
  const path = candidate.replaceAll("\\", "/");
  if (!/\/__tests__\/.*\.test\.(?:ts|tsx)$/.test(path)) return null;
  if (path.startsWith("src/__tests__/e2e/")) return "e2e";
  if (/\.browser\.test\.(?:ts|tsx)$/.test(path)) return "browser";
  if (
    path.startsWith("src/components/") ||
    path.startsWith("src/hooks/") ||
    /^src\/lib\/apps\/view-kits\/__tests__\/integration\/.*\.test\.tsx$/.test(path)
  ) {
    return "jsdom";
  }
  return "node";
}

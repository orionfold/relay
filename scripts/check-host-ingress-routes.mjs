import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src", "app", "api");
const publicRoutes = new Set([
  "auth/bootstrap",
  "auth/login",
  "auth/logout",
  "auth/recovery",
  "auth/status",
  "channels/inbound/slack",
  "health",
]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith("route.ts") ? [path] : [];
  });
}

const routes = walk(root).map((path) => relative(root, path).replace(/\/route\.ts$/, ""));
const classified = routes.map((route) => ({
  route: `/api/${route}`,
  access: publicRoutes.has(route) || route.startsWith("health/")
    ? "explicit-public"
    : "session-required-default",
}));

for (const route of publicRoutes) {
  if (!routes.includes(route) && route !== "health") {
    throw new Error(`Host ingress public-route classification is stale: /api/${route} does not exist`);
  }
}

console.log(JSON.stringify({ protectedByDefault: true, count: classified.length, routes: classified }, null, 2));

import { ensureBetterSqlite3NativeBinding } from "../src/lib/cli/native-binding-preflight";

try {
  await ensureBetterSqlite3NativeBinding();
  const [{ runHostCommand }, { relayProductVersion }] = await Promise.all([
    import("../src/lib/host/supervisor/cli"),
    import("../src/lib/config/version"),
  ]);
  const code = await runHostCommand(
    process.argv.slice(2),
    {
      log: (message) => console.log(message),
      error: (message) => console.error(message),
    },
    { version: relayProductVersion() },
  );
  process.exit(code);
} catch (error) {
  console.error(
    `HOST_STARTUP_FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

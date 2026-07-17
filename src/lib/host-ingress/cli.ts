import { authIsConfigured, createBootstrapToken, listSessions } from "./store";

type Output = { log(message: string): void; error(message: string): void };

export async function runAuthCommand(argv: string[], output: Output): Promise<number> {
  const action = argv[0];
  if (action === "bootstrap") {
    try {
      const result = createBootstrapToken();
      output.log("Relay first-admin bootstrap credential (valid for 15 minutes; single use):");
      output.log(result.token);
      output.log("Enter it only on Relay's Access setup screen. It is not saved in Relay logs.");
      return 0;
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  if (action === "status") {
    const configured = authIsConfigured();
    output.log(`Access configured: ${configured ? "yes" : "no"}`);
    if (configured) output.log(`Active sessions: ${listSessions().length}`);
    return 0;
  }
  output.error(`Unknown auth action: ${action ?? "(none)"}`);
  output.error("Available actions: bootstrap, status");
  return 1;
}

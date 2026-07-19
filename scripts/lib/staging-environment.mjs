import path from "node:path";

/**
 * Environment overrides shared by every customer-identical staging command.
 * Host control-plane state belongs inside the same disposable boundary as the
 * staged Cell/app data; it must never fall through to ~/.relay-host.
 */
export function isolatedStagingEnvironment(dataDir) {
  const resolvedDataDir = path.resolve(dataDir);
  return {
    RELAY_DATA_DIR: resolvedDataDir,
    RELAY_HOST_ROOT: path.join(resolvedDataDir, "host"),
    RELAY_DEV_MODE: "",
    RELAY_INSTANCE_MODE: "",
  };
}

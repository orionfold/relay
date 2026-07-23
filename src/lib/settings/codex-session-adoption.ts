import { chmod, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readCodexAuthState } from "@/lib/agents/runtime/openai-codex-auth";
import {
  clearOpenAIOAuthStatus,
  isUsableCodexChatGPTAuthPayload,
  setOpenAIAuthSettings,
} from "@/lib/settings/openai-auth";
import {
  getAinativeCodexAuthPath,
  getGlobalCodexAuthPath,
} from "@/lib/utils/ainative-paths";

export class CodexSessionAdoptionError extends Error {
  override name = "CodexSessionAdoptionError";

  constructor(
    message: string,
    readonly status: 400 | 409 | 500,
  ) {
    super(message);
  }
}

function currentUid(): number | null {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

async function readSafeGlobalAuthFile(path: string): Promise<Buffer> {
  let source;
  try {
    source = await lstat(path);
  } catch {
    throw new CodexSessionAdoptionError(
      "No usable existing Codex sign-in was found on this machine.",
      400,
    );
  }

  if (!source.isFile() || source.isSymbolicLink()) {
    throw new CodexSessionAdoptionError(
      "The existing Codex sign-in is not a regular credential file.",
      400,
    );
  }
  const uid = currentUid();
  if (uid !== null && source.uid !== uid) {
    throw new CodexSessionAdoptionError(
      "The existing Codex sign-in is owned by another system user.",
      400,
    );
  }
  if ((source.mode & 0o077) !== 0) {
    throw new CodexSessionAdoptionError(
      "The existing Codex credential file is accessible to other users. Secure it before importing.",
      400,
    );
  }
  const bytes = await readFile(path);
  const afterRead = await lstat(path);
  if (
    !afterRead.isFile() ||
    afterRead.isSymbolicLink() ||
    afterRead.dev !== source.dev ||
    afterRead.ino !== source.ino ||
    afterRead.size !== source.size ||
    afterRead.mtimeMs !== source.mtimeMs
  ) {
    throw new CodexSessionAdoptionError(
      "The existing Codex sign-in changed while Relay was reading it. Try again.",
      409,
    );
  }
  if (!isUsableCodexChatGPTAuthPayload(bytes.toString("utf8"))) {
    throw new CodexSessionAdoptionError(
      "The existing Codex credential file does not contain a usable ChatGPT session.",
      400,
    );
  }
  return bytes;
}

export async function adoptExistingCodexSession() {
  const sourcePath = getGlobalCodexAuthPath();
  const destinationPath = getAinativeCodexAuthPath();
  const source = await readSafeGlobalAuthFile(sourcePath);

  try {
    await lstat(destinationPath);
    throw new CodexSessionAdoptionError(
      "Relay already has an isolated Codex credential file. Sign out or repair that session before importing another.",
      409,
    );
  } catch (error) {
    if (error instanceof CodexSessionAdoptionError) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") {
      throw new CodexSessionAdoptionError(
        "Relay could not inspect its isolated Codex credential store.",
        500,
      );
    }
  }

  const destinationDir = dirname(destinationPath);
  await mkdir(destinationDir, { recursive: true, mode: 0o700 });
  await chmod(destinationDir, 0o700);
  let created = false;
  try {
    await writeFile(destinationPath, source, {
      flag: "wx",
      mode: 0o600,
    });
    created = true;
    await setOpenAIAuthSettings({ method: "oauth" });
    const state = await readCodexAuthState({ refreshToken: true });
    if (!state.connected) {
      throw new Error("Codex did not accept the imported ChatGPT session.");
    }
    return state;
  } catch (error) {
    if (created) {
      await rm(destinationPath, { force: true }).catch(() => undefined);
      await clearOpenAIOAuthStatus().catch(() => undefined);
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code) === "EEXIST"
    ) {
      throw new CodexSessionAdoptionError(
        "Relay already has an isolated Codex credential file. Nothing was overwritten.",
        409,
      );
    }
    if (error instanceof CodexSessionAdoptionError) throw error;
    throw new CodexSessionAdoptionError(
      "Relay copied the existing Codex sign-in but could not verify it. The isolated copy was removed. Sign in with ChatGPT instead or try again.",
      400,
    );
  }
}

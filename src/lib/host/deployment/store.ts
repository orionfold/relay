import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { RelayHostError } from "@/lib/host/supervisor/errors";
import { assertContentFree } from "@/lib/host/supervisor/policy";
import { relayHostRoot } from "@/lib/host/supervisor/registry";
import {
  HostDeploymentJourneySchema,
  defaultHostDeploymentJourney,
  type HostDeploymentJourney,
} from "./contracts";

export class HostDeploymentStore {
  readonly root: string;
  readonly path: string;
  private readonly lockPath: string;

  constructor(root?: string) {
    this.root = relayHostRoot(root);
    this.path = join(this.root, "deployment-journey.json");
    this.lockPath = `${this.path}.lock`;
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
  }

  read(): HostDeploymentJourney {
    if (!existsSync(this.path)) return defaultHostDeploymentJourney();
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      throw new RelayHostError(
        "HOST_DEPLOYMENT_STORE_CORRUPT",
        "Relay Host deployment journey is unreadable or invalid JSON.",
        undefined,
        { cause: error },
      );
    }
    const parsed = HostDeploymentJourneySchema.safeParse(value);
    if (!parsed.success) {
      throw new RelayHostError(
        "HOST_DEPLOYMENT_STORE_SCHEMA_UNSUPPORTED",
        "Relay Host deployment journey has an invalid or unsupported schema.",
      );
    }
    assertContentFree(parsed.data);
    return parsed.data;
  }

  update(change: (current: HostDeploymentJourney) => HostDeploymentJourney): HostDeploymentJourney {
    const lock = this.acquireLock();
    const temporary = `${this.path}.${process.pid}.tmp`;
    try {
      const next = HostDeploymentJourneySchema.parse(change(this.read()));
      assertContentFree(next);
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, this.path);
      chmodSync(this.path, 0o600);
      return next;
    } catch (error) {
      if (error instanceof RelayHostError) throw error;
      throw new RelayHostError(
        "HOST_DEPLOYMENT_STORE_WRITE_FAILED",
        "Relay Host deployment journey could not be saved.",
        undefined,
        { cause: error as Error },
      );
    } finally {
      rmSync(temporary, { force: true });
      closeSync(lock);
      rmSync(this.lockPath, { force: true });
    }
  }

  private acquireLock(): number {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const lock = openSync(this.lockPath, "wx", 0o600);
        try {
          writeFileSync(lock, `${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`);
          return lock;
        } catch (error) {
          closeSync(lock);
          rmSync(this.lockPath, { force: true });
          throw error;
        }
      } catch (error) {
        if (attempt === 0) {
          try {
            if (Date.now() - statSync(this.lockPath).mtimeMs > 30_000) {
              rmSync(this.lockPath, { force: true });
              continue;
            }
          } catch {
            // The competing writer may have completed between open and stat.
          }
        }
        throw new RelayHostError(
          "HOST_DEPLOYMENT_STORE_BUSY",
          "Another Relay Host deployment update is already in progress.",
          undefined,
          { cause: error },
        );
      }
    }
    throw new RelayHostError(
      "HOST_DEPLOYMENT_STORE_BUSY",
      "Another Relay Host deployment update is already in progress.",
    );
  }
}

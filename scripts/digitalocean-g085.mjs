#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createAccessG085,
  createComputeG085,
  createG085Plan,
  createG085State,
  createNetworkG085,
  createStorageG085,
  destroyG085,
  DigitalOceanG085Client,
  DigitalOceanG085Error,
  inventoryG085,
  preflightG085,
  redactG085,
  validateG085State,
} from "./lib/digitalocean-g085.mjs";

const USAGE = `Usage: node --env-file=.env.local scripts/digitalocean-g085.mjs <command> [options]

Commands:
  plan       --state <file> --run-id <id> --relay-version <version> --cell-image <digest-ref> --ssh-cidr <ip/32>
  preflight  --state <file>
  access     --state <file> --public-key <file>
  network    --state <file>
  storage    --state <file>
  compute    --state <file> --public-key <file>
  inventory  --state <file>
  destroy    --state <file>

The G-085 plan is fail-closed to SFO3, s-2vcpu-4gb, Ubuntu 24.04 x64 and a 10 GiB volume.

The state file contains provider IDs and redacted receipts but never credentials.
Run one command per operator-visible DigitalOcean browser checkpoint.`;

function parse(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new DigitalOceanG085Error("G085_CLI_ARGUMENT_INVALID", `Invalid argument near ${name ?? "end"}.`);
    }
    if (values.has(name.slice(2))) {
      throw new DigitalOceanG085Error("G085_CLI_ARGUMENT_INVALID", `Duplicate ${name} option.`);
    }
    values.set(name.slice(2), value);
  }
  return { command, values };
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new DigitalOceanG085Error("G085_CLI_ARGUMENT_REQUIRED", `Missing --${name}.`);
  return value;
}

function readState(file) {
  if (!existsSync(file)) {
    throw new DigitalOceanG085Error("G085_STATE_MISSING", `G-085 state does not exist: ${file}`);
  }
  const state = JSON.parse(readFileSync(file, "utf8"));
  state.reservedIpBaseline ??= null;
  state.cleanupIds ??= null;
  return validateG085State(state);
}

function writeState(file, state) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(redactG085(state), null, 2)}\n`, { mode: 0o600 });
}

function publicKey(values) {
  return readFileSync(path.resolve(required(values, "public-key")), "utf8").trim();
}

async function main() {
  const { command, values } = parse(process.argv.slice(2));
  if (!command || command === "help") {
    console.log(USAGE);
    return command === "help" ? 0 : 1;
  }
  const stateFile = path.resolve(required(values, "state"));
  if (command === "plan") {
    if (existsSync(stateFile)) {
      throw new DigitalOceanG085Error("G085_STATE_EXISTS", `Refusing to replace existing state: ${stateFile}`);
    }
    const plan = createG085Plan({
      runId: required(values, "run-id"),
      relayVersion: required(values, "relay-version"),
      cellImage: required(values, "cell-image"),
      sshSourceCidr: required(values, "ssh-cidr"),
      region: values.get("region") ?? "sfo3",
      size: values.get("size") ?? "s-2vcpu-4gb",
      image: values.get("image") ?? "ubuntu-24-04-x64",
      volumeGiB: Number(values.get("volume-gib") ?? "10"),
    });
    const state = createG085State(plan);
    writeState(stateFile, state);
    console.log(JSON.stringify({ reasonCode: "G085_PLAN_CREATED", stateFile, plan: redactG085(plan) }, null, 2));
    return 0;
  }

  const state = readState(stateFile);
  const client = new DigitalOceanG085Client({ token: process.env.DIGITALOCEAN_TOKEN });
  const checkpoint = (current) => writeState(stateFile, current);
  let result;
  switch (command) {
    case "preflight":
      result = await preflightG085(client, state);
      break;
    case "access":
      result = await createAccessG085(client, state, publicKey(values), { checkpoint });
      break;
    case "network":
      result = await createNetworkG085(client, state, { checkpoint });
      break;
    case "storage":
      result = await createStorageG085(client, state, { checkpoint });
      break;
    case "compute":
      result = await createComputeG085(client, state, publicKey(values), { checkpoint });
      break;
    case "inventory": {
      const inventory = await inventoryG085(client, state);
      console.log(JSON.stringify({ reasonCode: "G085_INVENTORY", inventory }, null, 2));
      return 0;
    }
    case "destroy":
      result = await destroyG085(client, state, { checkpoint });
      break;
    default:
      throw new DigitalOceanG085Error("G085_CLI_COMMAND_UNKNOWN", `Unknown command: ${command}`);
  }
  writeState(stateFile, result);
  console.log(JSON.stringify(result.receipts.at(-1), null, 2));
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  const named = error instanceof DigitalOceanG085Error
    ? error
    : new DigitalOceanG085Error("G085_UNEXPECTED", error instanceof Error ? error.message : String(error));
  console.error(`${named.code}: ${named.message}`);
  if (named.details) console.error(JSON.stringify(redactG085(named.details), null, 2));
  process.exitCode = 1;
}

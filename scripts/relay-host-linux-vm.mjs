#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  collectLocalSubstrateFacts,
  PortableHostError,
  readPortableAssets,
  redactPortable,
  renderCloudInit,
  validatePortableManifest,
  validateSubstrateFacts,
  verifyBootstrapReceipt,
} from "./lib/cloud-host/portable-contract.mjs";

const USAGE = `Usage: relay-host-playbook <command> [options]

Commands:
  manifest
      Print the same-version portable Host manifest.

  render --ssh-public-key-file <file> --hostname <dns-label> --output <file>
      Render secret-free cloud-init for a customer-created Ubuntu VM.

  preflight [--facts <json>] [--output <json>]
      Check the current machine, or deterministic supplied facts, against the
      compatible-VM contract. The output is a redacted receipt.

  verify-bootstrap --receipt <json>
      Verify the VM bootstrap completion receipt against this Relay release.

Do not put licenses, passwords, tokens, API keys, recovery keys, provider
credentials, or customer data in cloud user-data.`;

function parse(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new PortableHostError("PORTABLE_CLI_ARGUMENT_INVALID", `Invalid argument near ${name ?? "end"}.`);
    }
    const key = name.slice(2);
    if (values.has(key)) throw new PortableHostError("PORTABLE_CLI_ARGUMENT_INVALID", `Duplicate --${key}.`);
    values.set(key, value);
  }
  return { command, values };
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new PortableHostError("PORTABLE_CLI_ARGUMENT_REQUIRED", `Missing --${name}.`);
  return value;
}

function assertOnly(values, allowed) {
  for (const key of values.keys()) {
    if (!allowed.includes(key)) throw new PortableHostError("PORTABLE_CLI_ARGUMENT_UNKNOWN", `Unknown option --${key}.`);
  }
}

function readJson(file, code) {
  try {
    return JSON.parse(readFileSync(path.resolve(file), "utf8"));
  } catch (cause) {
    throw new PortableHostError(code, `Could not read valid JSON from ${file}.`, undefined, { cause });
  }
}

function writeJson(file, value) {
  writeFileSync(path.resolve(file), `${JSON.stringify(redactPortable(value), null, 2)}\n`, { mode: 0o600 });
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parse(argv);
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const assets = readPortableAssets();
  const manifest = validatePortableManifest(assets);

  if (command === "manifest") {
    assertOnly(values, []);
    console.log(JSON.stringify(manifest, null, 2));
    return 0;
  }
  if (command === "render") {
    assertOnly(values, ["ssh-public-key-file", "hostname", "output"]);
    const keyFile = path.resolve(required(values, "ssh-public-key-file"));
    if (!existsSync(keyFile)) throw new PortableHostError("PORTABLE_SSH_PUBLIC_KEY_MISSING", `SSH public key does not exist: ${keyFile}`);
    const rendered = renderCloudInit({
      manifest,
      template: assets.template,
      bootstrap: assets.bootstrap,
      input: {
        sshPublicKey: readFileSync(keyFile, "utf8").trim(),
        hostname: required(values, "hostname"),
      },
    });
    const output = path.resolve(required(values, "output"));
    writeFileSync(output, rendered, { mode: 0o600 });
    console.log(JSON.stringify({ reasonCode: "PORTABLE_CLOUD_INIT_RENDERED", output, relayVersion: manifest.release.relayVersion, bootstrapSha256: manifest.bootstrap.sha256 }, null, 2));
    return 0;
  }
  if (command === "preflight") {
    assertOnly(values, ["facts", "output"]);
    const facts = values.get("facts")
      ? readJson(values.get("facts"), "PORTABLE_FACTS_UNREADABLE")
      : collectLocalSubstrateFacts();
    const receipt = validateSubstrateFacts(facts, manifest);
    if (values.get("output")) writeJson(values.get("output"), receipt);
    console.log(JSON.stringify(receipt, null, 2));
    return 0;
  }
  if (command === "verify-bootstrap") {
    assertOnly(values, ["receipt"]);
    const result = verifyBootstrapReceipt(readJson(required(values, "receipt"), "PORTABLE_BOOTSTRAP_RECEIPT_UNREADABLE"), manifest);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  throw new PortableHostError("PORTABLE_CLI_COMMAND_UNKNOWN", `Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const named = error instanceof PortableHostError
      ? error
      : new PortableHostError("PORTABLE_UNEXPECTED", error instanceof Error ? error.message : String(error));
    console.error(`${named.code}: ${named.message}`);
    if (named.details) console.error(JSON.stringify(redactPortable(named.details), null, 2));
    process.exitCode = 1;
  }
}

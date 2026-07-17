#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "output/relay-host");
mkdirSync(directory, { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(
  resolve(directory, "local-test-private.pem"),
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 },
);
writeFileSync(
  resolve(directory, "local-test-public.pem"),
  publicKey.export({ type: "spki", format: "pem" }),
  { mode: 0o644 },
);
console.log(`local test key generated in ${directory}`);

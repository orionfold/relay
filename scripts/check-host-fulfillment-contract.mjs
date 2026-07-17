import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CONTRACT = Object.freeze({
  licenseSchema: "orionfold.license/v1",
  grantSchema: "orionfold.relay-host/v1",
  entitlement: "product:relay-host",
  launchSku: "relay-host-10-annual",
  hosts: 1,
  managedCells: 10,
  pricingUrl: "https://orionfold.com/relay/pricing.json",
});

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function publicKey(rawBase64) {
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  const raw = Buffer.from(rawBase64, "base64");
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, raw]),
    format: "der",
    type: "spki",
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requireText(findings, relativePath, text) {
  if (!read(relativePath).includes(text)) {
    findings.push(`${relativePath} is missing ${JSON.stringify(text)}`);
  }
}

export function checkHostFulfillmentContract() {
  const findings = [];
  const schema = JSON.parse(read("contracts/relay-host-license-v1.schema.json"));
  const vector = JSON.parse(
    read("src/lib/licensing/__tests__/fixtures/relay-host-license-v1.json")
  );

  if (schema.properties?.payload?.properties?.schema?.const !== CONTRACT.licenseSchema) {
    findings.push("JSON Schema outer license contract drifted");
  }
  const hostGrant = schema.$defs?.hostGrant;
  if (hostGrant?.properties?.schema?.const !== CONTRACT.grantSchema) {
    findings.push("JSON Schema Host grant contract drifted");
  }
  if (!schema.properties?.payload?.properties?.entitlements?.contains ||
      schema.properties.payload.properties.entitlements.contains.const !== CONTRACT.entitlement) {
    findings.push("JSON Schema no longer requires the Host entitlement");
  }

  const caseNames = vector.cases.map((entry) => entry.name).sort();
  const requiredCases = [
    "capacity-upgrade",
    "distinct-owner",
    "host-only",
    "operator-bundle",
    "pack-only",
  ];
  if (JSON.stringify(caseNames) !== JSON.stringify(requiredCases)) {
    findings.push(`fixture cases drifted: ${caseNames.join(", ")}`);
  }

  const key = publicKey(vector.dev_key.public_key_b64);
  for (const entry of vector.cases) {
    const canonical = canonicalize(entry.payload);
    const digest = crypto
      .createHash("sha256")
      .update(canonical)
      .digest("hex")
      .slice(0, 12);
    if (canonical !== entry.canonical_utf8) {
      findings.push(`${entry.name}: canonical bytes drifted`);
    }
    if (digest !== entry.canonical_sha256_12) {
      findings.push(`${entry.name}: canonical hash drifted`);
    }
    if (
      !crypto.verify(
        null,
        Buffer.from(canonical),
        key,
        Buffer.from(entry.signature.value, "base64")
      )
    ) {
      findings.push(`${entry.name}: dev signature does not verify`);
    }
  }

  const hostOnly = vector.cases.find((entry) => entry.name === "host-only");
  const grant = hostOnly?.payload?.grants?.[CONTRACT.entitlement];
  if (
    grant?.sku !== CONTRACT.launchSku ||
    grant?.limits?.hosts !== CONTRACT.hosts ||
    grant?.limits?.managed_cells !== CONTRACT.managedCells
  ) {
    findings.push("host-only fixture does not carry the accepted launch limits");
  }

  for (const file of [
    "README.md",
    "docs/relay-host-fulfillment.md",
    "docs/trust/license-terms.md",
    "features/oci-fulfillment.md",
  ]) {
    requireText(findings, file, CONTRACT.entitlement);
    requireText(findings, file, "ten managed Cells");
  }
  requireText(findings, "README.md", CONTRACT.pricingUrl);
  requireText(findings, "docs/relay-host-fulfillment.md", CONTRACT.pricingUrl);
  requireText(
    findings,
    ".agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md",
    CONTRACT.grantSchema
  );

  for (const file of [
    "README.md",
    "docs/relay-host-fulfillment.md",
    "docs/trust/license-terms.md",
    "features/oci-fulfillment.md",
    ".agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md",
    "features/licensed-self-service-cloud-deploy.md",
    "features/licensed-self-service-cloud-deploy-plan.md",
  ]) {
    if (read(file).includes("product:relay-cloud-deploy")) {
      findings.push(`${file} still uses the provisional cloud-specific entitlement`);
    }
  }

  return findings;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  const findings = checkHostFulfillmentContract();
  if (findings.length > 0) {
    console.error("[host-fulfillment] FAILED");
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[host-fulfillment] OK — ${CONTRACT.entitlement}, ` +
        `${CONTRACT.hosts} Host/${CONTRACT.managedCells} managed Cells, ` +
        "5 canonical issuer/verifier fixtures"
    );
  }
}

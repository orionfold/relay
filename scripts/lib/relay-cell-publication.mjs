import { JSON_SCHEMA, load } from "js-yaml";
import { canonicalJson } from "./relay-host-manifest.mjs";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const PINNED_ACTION_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/u;
const REQUIRED_PLATFORM_CHECKS = ["content", "components", "vulnerabilities", "reproducibility", "npmBoundary", "manifest", "conformance"];

export class RelayCellPublicationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "RelayCellPublicationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new RelayCellPublicationError(code, message, details);
}

function assert(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

function sameMembers(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function exactObject(actual, expected) {
  return actual &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value);
}

export function validatePublicationPolicy(policy) {
  assert(policy?.contractVersion === 1, "CELL_PUBLICATION_POLICY_INVALID", "policy contractVersion must be 1");
  assert(policy?.sourceRepository === "orionfold/relay", "CELL_PUBLICATION_POLICY_INVALID", "source repository must be orionfold/relay");
  assert(policy?.registry === "ghcr.io", "CELL_PUBLICATION_POLICY_INVALID", "GHCR must be the primary registry");
  assert(policy?.images?.production === "ghcr.io/orionfold/relay-cell", "CELL_PUBLICATION_POLICY_INVALID", "production image namespace differs from the approved namespace");
  assert(policy?.images?.staging === "ghcr.io/orionfold/relay-cell-staging", "CELL_PUBLICATION_POLICY_INVALID", "staging image namespace differs from the approved namespace");
  assert(policy?.visibility?.production === "public" && policy.visibility.staging === "private" && policy.visibility.anonymousProductionPull === true, "CELL_PUBLICATION_POLICY_INVALID", "registry visibility policy differs from the approved public/private split");
  assert(policy?.release?.workflow === ".github/workflows/publish-relay-cell.yml", "CELL_PUBLICATION_POLICY_INVALID", "release workflow path differs from the trusted identity");
  assert(policy?.release?.triggerTagPattern === "^v[0-9]+\\.[0-9]+\\.[0-9]+$", "CELL_PUBLICATION_POLICY_INVALID", "release tag pattern must accept exact semantic versions only");
  assert(policy?.release?.immutableTagTemplate === "v{version}" && policy.release.minorTagTemplate === "v{major}.{minor}" && policy.release.promotionTag === "stable" && policy.release.previousPromotionTag === "stable-previous", "CELL_PUBLICATION_POLICY_INVALID", "release tag policy differs from the approved exact/minor/stable policy");
  assert(sameMembers(policy?.release?.forbiddenTags, ["latest"]), "CELL_PUBLICATION_POLICY_INVALID", "latest must be the only explicitly forbidden launch tag");
  assert(policy?.release?.productionEnvironment === "oci-production" && policy.release.stagingEnvironment === "oci-staging", "CELL_PUBLICATION_POLICY_INVALID", "protected environment names differ from policy");
  assert(policy?.identity?.oidcIssuer === "https://token.actions.githubusercontent.com", "CELL_PUBLICATION_POLICY_INVALID", "OIDC issuer must be GitHub Actions");
  assert(policy?.identity?.certificateIdentityPattern === "^https://github\\.com/orionfold/relay/\\.github/workflows/publish-relay-cell\\.yml@refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$", "CELL_PUBLICATION_POLICY_INVALID", "certificate identity must bind the release workflow and exact tag");
  assert(sameMembers(policy?.platforms, ["linux/amd64", "linux/arm64"]), "CELL_PUBLICATION_POLICY_INVALID", "exactly linux/amd64 and linux/arm64 are required");
  assert(exactObject(policy?.permissions, { contents: "read", packages: "write", "id-token": "write", attestations: "write", "artifact-metadata": "write" }), "CELL_PUBLICATION_PERMISSION_EXCESSIVE", "publication permissions must be the exact approved least-privilege set");
  assert(policy?.retention?.productionExactReleases === "indefinite" && policy.retention.stagingMaxAgeDays === 30 && policy.retention.stagingMaxCount === 5 && policy.retention.automaticProductionDeletion === false, "CELL_PUBLICATION_POLICY_INVALID", "retention policy differs from the approved launch policy");
  assert(policy?.support?.supportedStableDigests === 2 && policy.support.authority === "digest" && policy.support.tagsAreDiscoveryOnly === true, "CELL_PUBLICATION_POLICY_INVALID", "support authority must be two stable digests with digest authority");
  assert(sameMembers(policy?.support?.claims, ["origin", "integrity", "provenance", "compatibility"]), "CELL_PUBLICATION_POLICY_INVALID", "support claims differ from the conservative approved set");
  assert(sameMembers(policy?.support?.excludedClaims, ["vulnerability-free", "uptime-sla", "rpo", "rto"]), "CELL_PUBLICATION_POLICY_INVALID", "excluded support claims differ from policy");
  assert(Array.isArray(policy?.paidDependencies) && policy.paidDependencies.length === 0, "CELL_PUBLICATION_POLICY_INVALID", "paid publication dependencies are forbidden at launch");
  assert(Array.isArray(policy?.mirrors) && policy.mirrors.length === 0, "CELL_PUBLICATION_POLICY_INVALID", "registry mirrors are not approved at launch");
  return policy;
}

export function validateReleaseInput(input, policy) {
  validatePublicationPolicy(policy);
  assert(new RegExp(policy.release.triggerTagPattern, "u").test(input?.tag ?? ""), "CELL_PUBLICATION_TAG_INVALID", "release ref must be an exact vX.Y.Z tag");
  const version = input.tag.slice(1);
  assert(VERSION_PATTERN.test(version), "CELL_PUBLICATION_TAG_INVALID", "release version must be semantic X.Y.Z");
  assert(input?.packageVersion === version, "CELL_PUBLICATION_VERSION_MISMATCH", `tag ${input?.tag} does not match package version ${input?.packageVersion}`);
  assert(input?.sourceState === "clean", "CELL_PUBLICATION_SOURCE_DIRTY", "publication requires a clean source tree");
  assert(REVISION_PATTERN.test(input?.sourceRevision ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "source revision must be a full git SHA");
  assert(DIGEST_PATTERN.test(input?.sourceTreeDigest ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "source tree digest must be sha256");
  const [major, minor, patch] = version.split(".");
  return {
    version,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    immutableTag: `v${version}`,
    minorTag: `v${major}.${minor}`,
  };
}

function expectedIdentity(policy, version) {
  return `https://github.com/${policy.sourceRepository}/.github/workflows/publish-relay-cell.yml@refs/tags/v${version}`;
}

function validateAttestation(attestation, type, policy, version) {
  assert(attestation?.verified === true, "CELL_PUBLICATION_ATTESTATION_MISSING", `${type} attestation is not verified`);
  assert(typeof attestation?.url === "string" && /^https:\/\//u.test(attestation.url), "CELL_PUBLICATION_ATTESTATION_MISSING", `${type} attestation URL is missing`);
  assert(attestation?.issuer === policy.identity.oidcIssuer, "CELL_PUBLICATION_SIGNER_INVALID", `${type} issuer differs from policy`);
  assert(new RegExp(policy.identity.certificateIdentityPattern, "u").test(attestation?.identity ?? ""), "CELL_PUBLICATION_SIGNER_INVALID", `${type} identity differs from the protected release workflow`);
  assert(attestation.identity === expectedIdentity(policy, version), "CELL_PUBLICATION_SIGNER_INVALID", `${type} identity tag differs from Relay ${version}`);
}

export function validatePlatformReceipt(receipt, policy) {
  validatePublicationPolicy(policy);
  assert(policy.platforms.includes(receipt?.platform), "CELL_PUBLICATION_PLATFORM_SET_INVALID", "platform receipt must name an approved native platform");
  assert(receipt?.contractVersion === 1, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "platform receipt contract must be v1");
  assert(VERSION_PATTERN.test(receipt?.relayVersion ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "Relay version is invalid");
  assert(REVISION_PATTERN.test(receipt?.sourceRevision ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "source revision is invalid");
  assert(DIGEST_PATTERN.test(receipt?.sourceTreeDigest ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "source tree digest must be sha256");
  assert(DIGEST_PATTERN.test(receipt?.imageDigest ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} image digest is invalid`);
  assert(receipt?.registryDigest === receipt.imageDigest, "CELL_PUBLICATION_DIGEST_MISMATCH", `${receipt.platform} registry digest differs from the audited OCI digest`);
  assert(receipt?.imageReference === `${policy.images.production}@${receipt.imageDigest}`, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} image reference is not digest pinned to production`);
  assert(receipt?.schema?.min === 1 && receipt.schema.max === 1, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} schema contract drifted`);
  assert(receipt?.runtime?.uid === 10001 && receipt.runtime.dataMount === "/var/lib/relay" && receipt.runtime.readOnlyRoot === true, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} runtime contract drifted`);
  assert(receipt?.checks && sameMembers(Object.keys(receipt.checks), REQUIRED_PLATFORM_CHECKS) && Object.values(receipt.checks).every((status) => status === "pass"), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} has a missing or failed G-093 gate`);
  assert(receipt?.signature?.verified === true, "CELL_PUBLICATION_SIGNER_INVALID", `${receipt.platform} Cosign signature is not verified`);
  assert(receipt.signature.issuer === policy.identity.oidcIssuer, "CELL_PUBLICATION_SIGNER_INVALID", `${receipt.platform} signature issuer differs from policy`);
  assert(new RegExp(policy.identity.certificateIdentityPattern, "u").test(receipt.signature.identity ?? ""), "CELL_PUBLICATION_SIGNER_INVALID", `${receipt.platform} signature identity differs from policy`);
  assert(receipt.signature.identity === expectedIdentity(policy, receipt.relayVersion), "CELL_PUBLICATION_SIGNER_INVALID", `${receipt.platform} signature tag differs from its Relay version`);
  validateAttestation(receipt?.attestations?.provenance, "provenance", policy, receipt.relayVersion);
  validateAttestation(receipt?.attestations?.sbom, "SBOM", policy, receipt.relayVersion);
  assert(Number.isInteger(receipt?.measurements?.imageBytes) && receipt.measurements.imageBytes > 0 && Number.isInteger(receipt.measurements.ociArchiveBytes) && receipt.measurements.ociArchiveBytes > 0 && DIGEST_PATTERN.test(receipt.measurements.ociArchiveDigest ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} OCI measurements are incomplete`);
  assert(typeof receipt?.npm?.name === "string" && receipt.npm.name.length > 0 && DIGEST_PATTERN.test(receipt.npm.digest ?? "") && Number.isInteger(receipt.npm.compressedBytes) && receipt.npm.compressedBytes > 0 && Number.isInteger(receipt.npm.unpackedBytes) && receipt.npm.unpackedBytes > 0 && Number.isInteger(receipt.npm.fileCount) && receipt.npm.fileCount > 0, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} npm closure measurements are incomplete`);
  return receipt;
}

export function validatePlatformEvidence(receipts, policy) {
  validatePublicationPolicy(policy);
  assert(Array.isArray(receipts) && receipts.length === policy.platforms.length, "CELL_PUBLICATION_PLATFORM_SET_INVALID", "one receipt is required for each approved platform");
  assert(sameMembers(receipts.map((receipt) => receipt.platform), policy.platforms), "CELL_PUBLICATION_PLATFORM_SET_INVALID", "platform receipts must contain exactly linux/amd64 and linux/arm64");
  assert(new Set(receipts.map((receipt) => receipt.imageDigest)).size === receipts.length, "CELL_PUBLICATION_PLATFORM_SET_INVALID", "native platform receipts must have distinct image digests");

  const reference = receipts[0];
  for (const receipt of receipts) {
    validatePlatformReceipt(receipt, policy);
    assert(receipt?.relayVersion === reference.relayVersion && receipt?.sourceRevision === reference.sourceRevision && receipt?.sourceTreeDigest === reference.sourceTreeDigest && canonicalJson(receipt?.schema) === canonicalJson(reference.schema) && canonicalJson(receipt?.runtime) === canonicalJson(reference.runtime), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} shared release contract drifted`);
    assert(receipt.npm.name === reference.npm.name && receipt.npm.digest === reference.npm.digest && receipt.npm.compressedBytes === reference.npm.compressedBytes && receipt.npm.unpackedBytes === reference.npm.unpackedBytes && receipt.npm.fileCount === reference.npm.fileCount, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `${receipt.platform} npm closure differs from the sibling platform`);
  }
  return receipts;
}

export function createReleaseIndexPlan(receipts, policy) {
  validatePlatformEvidence(receipts, policy);
  const reference = receipts[0];
  const [major, minor] = reference.relayVersion.split(".");
  return {
    contractVersion: 1,
    authority: "digest",
    image: policy.images.production,
    releaseTag: `v${reference.relayVersion}`,
    discoveryTags: [`v${major}.${minor}`],
    forbiddenTags: [...policy.release.forbiddenTags],
    platforms: receipts
      .map(({ platform, imageDigest }) => ({ platform, imageDigest, imageReference: `${policy.images.production}@${imageDigest}` }))
      .sort((left, right) => left.platform.localeCompare(right.platform)),
    relayVersion: reference.relayVersion,
    sourceRevision: reference.sourceRevision,
    sourceTreeDigest: reference.sourceTreeDigest,
    npmClosure: {
      compressedBytes: reference.npm.compressedBytes,
      unpackedBytes: reference.npm.unpackedBytes,
      fileCount: reference.npm.fileCount,
      explanation: "The npm package relies on the destination Node runtime, operating system, native libraries and installed dependency tree.",
    },
    ociClosure: receipts.map((receipt) => ({ platform: receipt.platform, imageBytes: receipt.measurements.imageBytes, archiveBytes: receipt.measurements.ociArchiveBytes })),
    promotionEligible: true,
  };
}

export function validatePromotionInput(input, policy) {
  validatePublicationPolicy(policy);
  assert(DIGEST_PATTERN.test(input?.digest ?? ""), "CELL_PUBLICATION_TAG_REFUSED", "promotion requires an immutable sha256 digest");
  assert(VERSION_PATTERN.test(input?.version ?? ""), "CELL_PUBLICATION_TAG_INVALID", "promotion version must be X.Y.Z");
  assert(input?.tag === policy.release.promotionTag, "CELL_PUBLICATION_TAG_REFUSED", "only the stable discovery tag may be promoted by this operation");
  assert(!policy.release.forbiddenTags.includes(input.tag), "CELL_PUBLICATION_TAG_REFUSED", `${input.tag} is forbidden`);
  assert(["promote", "rollback"].includes(input?.operation), "CELL_PUBLICATION_TAG_REFUSED", "operation must name promote or rollback");
  if (input.operation === "promote") {
    assert(input.packageVersion === input.version, "CELL_PUBLICATION_VERSION_MISMATCH", "forward promotion must target the version currently declared by package.json");
  }
  return {
    operation: input.operation,
    imageReference: `${policy.images.production}@${input.digest}`,
    target: `${policy.images.production}:${input.tag}`,
    previousTarget: `${policy.images.production}:${policy.release.previousPromotionTag}`,
  };
}

function collectUses(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => collectUses(item, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "uses" && typeof child === "string") found.push(child);
      collectUses(child, found);
    }
  }
  return found;
}

function parseWorkflowLiteral(source) {
  try {
    // JSON_SCHEMA preserves the literal key `on` instead of YAML 1.1 boolean coercion.
    return load(source, { schema: JSON_SCHEMA, json: true });
  } catch (error) {
    fail("CELL_PUBLICATION_WORKFLOW_INVALID", `workflow YAML is invalid: ${error.message}`);
  }
}

function validatePinnedActions(workflow) {
  for (const action of collectUses(workflow)) {
    assert(action.startsWith("./") || PINNED_ACTION_PATTERN.test(action), "CELL_PUBLICATION_WORKFLOW_INVALID", `external action must be pinned to a full commit SHA: ${action}`);
  }
}

function validateJobPermissions(job, expected, label) {
  assert(exactObject(job?.permissions, expected), "CELL_PUBLICATION_PERMISSION_EXCESSIVE", `${label} permissions must exactly match publication policy`);
}

export function validatePublicationWorkflow(source, policy) {
  validatePublicationPolicy(policy);
  const workflow = parseWorkflowLiteral(source);
  const trigger = workflow?.on;
  assert(trigger && Object.keys(trigger).length === 1 && Array.isArray(trigger?.push?.tags) && sameMembers(trigger.push.tags, ["v*"]), "CELL_PUBLICATION_WORKFLOW_INVALID", "production publication must be triggered only by v* tag pushes");
  assert(exactObject(workflow?.permissions, { contents: "read" }), "CELL_PUBLICATION_PERMISSION_EXCESSIVE", "workflow default permissions must be contents: read only");
  assert(workflow?.jobs?.platform && workflow?.jobs?.publish && workflow?.jobs?.index, "CELL_PUBLICATION_WORKFLOW_INVALID", "staging platform, production publish, and index jobs are required");
  assert(workflow.jobs.platform.needs === "quality" && workflow.jobs.publish.needs === "platform" && workflow.jobs.index.needs === "publish", "CELL_PUBLICATION_WORKFLOW_INVALID", "publication jobs must preserve quality → staging → production → index ordering");
  validateJobPermissions(workflow.jobs.platform, { contents: "read", packages: "write" }, "staging platform job");
  validateJobPermissions(workflow.jobs.publish, policy.permissions, "production publish job");
  validateJobPermissions(workflow.jobs.index, policy.permissions, "index job");
  assert(workflow.jobs.platform.environment === policy.release.stagingEnvironment, "CELL_PUBLICATION_WORKFLOW_INVALID", "audited native artifacts must pass through the protected staging environment");
  assert(workflow.jobs.publish.environment === policy.release.productionEnvironment && workflow.jobs.index.environment === policy.release.productionEnvironment, "CELL_PUBLICATION_WORKFLOW_INVALID", "production publication jobs must use the protected production environment");
  for (const [label, matrix] of [["staging", workflow.jobs.platform?.strategy?.matrix?.include], ["production", workflow.jobs.publish?.strategy?.matrix?.include]]) {
    assert(Array.isArray(matrix) && sameMembers(matrix.map((item) => item.platform), policy.platforms), "CELL_PUBLICATION_PLATFORM_SET_INVALID", `${label} workflow matrix must use both approved native platforms`);
    assert(matrix.every((item) => item.runner === (item.platform === "linux/amd64" ? "ubuntu-24.04" : "ubuntu-24.04-arm")), "CELL_PUBLICATION_WORKFLOW_INVALID", `${label} workflow must use the approved native GitHub runners`);
  }
  validatePinnedActions(workflow);
  assert(!JSON.stringify(workflow.jobs.publish).includes("host:artifact:build") && !JSON.stringify(workflow.jobs.index).includes("host:artifact:build"), "CELL_PUBLICATION_WORKFLOW_INVALID", "production jobs must copy, not rebuild, the audited staging artifact");
  assert((source.match(/host:artifact:build/gu) ?? []).length === 1, "CELL_PUBLICATION_WORKFLOW_INVALID", "the G-093 artifact build must occur exactly once in the staging job");
  const text = source;
  const required = [
    "oras cp --from-oci-layout",
    "oras resolve",
    "CELL_PUBLICATION_DIGEST_MISMATCH",
    "cosign sign --yes",
    "cosign verify",
    "actions/attest@",
    "sbom-path:",
    "docker buildx imagetools create",
    "relay-cell-publication-receipt.mjs",
    "gh attestation verify",
    policy.images.staging,
  ];
  for (const phrase of required) assert(text.includes(phrase), "CELL_PUBLICATION_WORKFLOW_INVALID", `production workflow is missing required operation: ${phrase}`);
  assert(text.includes(policy.images.production), "CELL_PUBLICATION_WORKFLOW_INVALID", "production workflow uses the wrong image namespace");
  assert(!/\blatest\b/u.test(text), "CELL_PUBLICATION_TAG_REFUSED", "latest is forbidden in the production workflow");
  assert(!/npm publish|gh release create|docker build\b/u.test(text), "CELL_PUBLICATION_WORKFLOW_INVALID", "Cell publication must not publish npm, create a GitHub Release, or rebuild the audited image");
  return workflow;
}

export function validateIndexManifest(plan, manifest, digest, policy) {
  validatePublicationPolicy(policy);
  assert(DIGEST_PATTERN.test(digest ?? ""), "CELL_PUBLICATION_DIGEST_MISMATCH", "index digest must be sha256");
  assert(plan?.authority === "digest" && plan?.image === policy.images.production && Array.isArray(plan?.platforms), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "release index plan is invalid");
  assert(manifest?.schemaVersion === 2 && Array.isArray(manifest?.manifests), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "registry subject is not a multi-platform OCI/Docker index");
  const actual = manifest.manifests.map((descriptor) => ({
    platform: `${descriptor?.platform?.os}/${descriptor?.platform?.architecture}`,
    imageDigest: descriptor?.digest,
  }));
  const expected = plan.platforms.map(({ platform, imageDigest }) => ({ platform, imageDigest }));
  assert(actual.length === expected.length && expected.every((item) => actual.some((candidate) => candidate.platform === item.platform && candidate.imageDigest === item.imageDigest)), "CELL_PUBLICATION_PLATFORM_SET_INVALID", "registry index does not contain exactly the planned platform digests");
  return { digest, platforms: actual.sort((left, right) => left.platform.localeCompare(right.platform)) };
}

export function validateReleaseIndexEvidence(plan, digest, identity, attestationUrl, policy) {
  validatePublicationPolicy(policy);
  assert(plan?.contractVersion === 1 && plan.authority === "digest" && plan.image === policy.images.production, "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "release index plan contract is invalid");
  assert(VERSION_PATTERN.test(plan?.relayVersion ?? "") && REVISION_PATTERN.test(plan?.sourceRevision ?? "") && DIGEST_PATTERN.test(plan?.sourceTreeDigest ?? ""), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "release index plan identity is incomplete");
  assert(Array.isArray(plan?.platforms) && sameMembers(plan.platforms.map((item) => item.platform), policy.platforms) && plan.platforms.every((item) => DIGEST_PATTERN.test(item.imageDigest ?? "")), "CELL_PUBLICATION_PLATFORM_SET_INVALID", "release index plan platform set is invalid");
  assert(DIGEST_PATTERN.test(digest ?? ""), "CELL_PUBLICATION_DIGEST_MISMATCH", "multi-platform index digest is invalid");
  assert(identity === expectedIdentity(policy, plan.relayVersion), "CELL_PUBLICATION_SIGNER_INVALID", "index identity tag differs from the Relay version");
  assert(typeof attestationUrl === "string" && /^https:\/\/github\.com\/orionfold\/relay\/attestations\//u.test(attestationUrl), "CELL_PUBLICATION_ATTESTATION_MISSING", "index attestation URL is invalid");
  return { digest, identity, attestationUrl };
}

export function validatePromotionWorkflow(source, policy) {
  validatePublicationPolicy(policy);
  const workflow = parseWorkflowLiteral(source);
  assert(workflow?.on && Object.keys(workflow.on).length === 1 && workflow.on.workflow_dispatch?.inputs?.digest?.required === true && workflow.on.workflow_dispatch?.inputs?.version?.required === true, "CELL_PUBLICATION_WORKFLOW_INVALID", "stable promotion must be a manual digest/version operation only");
  assert(exactObject(workflow?.permissions, { contents: "read" }), "CELL_PUBLICATION_PERMISSION_EXCESSIVE", "promotion workflow default permissions must be contents: read only");
  const job = workflow?.jobs?.promote;
  assert(job?.environment === policy.release.productionEnvironment, "CELL_PUBLICATION_WORKFLOW_INVALID", "promotion must use the protected production environment");
  assert(exactObject(job?.permissions, { contents: "read", packages: "write" }), "CELL_PUBLICATION_PERMISSION_EXCESSIVE", "promotion permissions must be contents read and packages write only");
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert(sameMembers(Object.keys(inputs), ["digest", "version", "operation"]) && inputs.operation.type === "choice" && inputs.operation.required === true && sameMembers(inputs.operation.options, ["promote", "rollback"]), "CELL_PUBLICATION_WORKFLOW_INVALID", "promotion inputs must be exact digest, version, and promote/rollback operation choices");
  validatePinnedActions(workflow);
  for (const phrase of ["validate-promotion", "cosign verify", "gh attestation verify", "oras tag", "$IMAGE@$DIGEST", policy.release.promotionTag, policy.release.previousPromotionTag, "inputs.operation"]) {
    assert(source.includes(phrase), "CELL_PUBLICATION_WORKFLOW_INVALID", `promotion workflow is missing required operation: ${phrase}`);
  }
  assert(!/\blatest\b|oras manifest delete|gh api.*DELETE|cosign sign/u.test(source), "CELL_PUBLICATION_TAG_REFUSED", "promotion may not use latest, delete content, or create a new signature");
  return workflow;
}

export function validateDocumentation(source, policy) {
  validatePublicationPolicy(policy);
  for (const phrase of [
    `${policy.images.production}@sha256:`,
    policy.identity.oidcIssuer,
    "cosign verify",
    "gh attestation verify",
    "oras cp",
    "vulnerability-free",
    "No Relay Cell image has been published",
  ]) {
    assert(source.includes(phrase), "CELL_PUBLICATION_POLICY_INVALID", `OCI release documentation is missing: ${phrase}`);
  }
  return true;
}

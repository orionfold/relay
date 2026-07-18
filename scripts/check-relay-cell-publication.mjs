#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateDocumentation,
  validatePromotionWorkflow,
  validatePublicationPolicy,
  validatePublicationWorkflow,
} from "./lib/relay-cell-publication.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = (path) => readFileSync(resolve(root, path), "utf8");
const policy = validatePublicationPolicy(JSON.parse(read("config/relay-cell-publication-policy.json")));
validatePublicationWorkflow(read(policy.release.workflow), policy);
validatePromotionWorkflow(read(".github/workflows/promote-relay-cell.yml"), policy);
validateDocumentation(read("docs/relay-cell-oci-release.md"), policy);

console.log(JSON.stringify({
  status: "verified",
  contractVersion: policy.contractVersion,
  productionImage: policy.images.production,
  stagingImage: policy.images.staging,
  platforms: policy.platforms,
  releaseTrigger: "exact-oci-version-tag-only",
  signatureAuthority: "github-actions-oidc",
  manifestAuthority: policy.support.authority,
  paidDependencies: policy.paidDependencies.length,
  mirrors: policy.mirrors.length,
  externalWrites: 0,
}, null, 2));

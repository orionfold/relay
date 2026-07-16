#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inputUrl = new URL("../features/cloud-deploy-cost-inputs.json", import.meta.url);
const inputs = JSON.parse(await readFile(inputUrl, "utf8"));

assert.match(inputs.asOf, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(inputs.currency, "USD");
assert.deepEqual(inputs.scenarios, [1, 10, 100]);

function railwayMonthly(count) {
  const p = inputs.providers.railway;
  const perInstance =
    p.instance.ramGb * p.ramGbMonth +
    p.instance.averageVcpu * p.vcpuMonth +
    p.instance.volumeGb * p.volumeGbMonth +
    p.instance.egressGb * p.egressGb;
  return Math.max(p.planFloorMonthly, count * perInstance);
}

function flyMonthly(count) {
  const p = inputs.providers.fly_ord;
  const perInstance = p.machineMonthly + p.instance.volumeGb * p.volumeGbMonth;
  return count * perInstance;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: inputs.currency,
    minimumFractionDigits: 2,
  }).format(value);
}

const rows = inputs.scenarios.map((instances) => ({
  instances,
  railway: money(railwayMonthly(instances)),
  flyOrd: money(flyMonthly(instances)),
}));

assert.equal(rows[0].railway, "$20.00");
assert.equal(rows[1].railway, "$170.00");
assert.equal(rows[2].railway, "$1,700.00");
assert.equal(rows[0].flyOrd, "$7.42");
assert.equal(rows[1].flyOrd, "$74.20");
assert.equal(rows[2].flyOrd, "$742.00");

console.log(JSON.stringify({ asOf: inputs.asOf, currency: inputs.currency, rows }, null, 2));

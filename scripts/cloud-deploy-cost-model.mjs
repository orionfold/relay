#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inputUrl = new URL("../features/cloud-deploy-cost-inputs.json", import.meta.url);
const inputs = JSON.parse(await readFile(inputUrl, "utf8"));

assert.match(inputs.asOf, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(inputs.currency, "USD");
assert.deepEqual(inputs.scenarios, [1, 10, 100]);

const admission = inputs.cellAdmission;
const provider = inputs.providers.digitaloceanBasic;

function cellCapacity(plan) {
  const memoryCapacity = Math.floor(
    (plan.memoryGiB * admission.maxMemoryUtilization -
      admission.hostReserveMemoryGiB) /
      admission.cellMemoryGiB,
  );
  const cpuCapacity = plan.vcpu * admission.maxCellsPerVcpu;
  return Math.max(0, Math.min(memoryCapacity, cpuCapacity));
}

const plans = provider.plans
  .map((plan) => ({ ...plan, cellCapacity: cellCapacity(plan) }))
  .filter((plan) => plan.cellCapacity > 0)
  .sort((a, b) => a.monthly - b.monthly);

assert.ok(plans.length > 0);

function hostPlanFor(cellCount) {
  const singleHost = plans.find((plan) => plan.cellCapacity >= cellCount);
  if (singleHost) {
    return { plan: singleHost, hosts: 1 };
  }

  const largest = plans.at(-1);
  return {
    plan: largest,
    hosts: Math.ceil(cellCount / largest.cellCapacity),
  };
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: inputs.currency,
    minimumFractionDigits: 2,
  }).format(value);
}

const rows = inputs.scenarios.map((cells) => {
  const { plan, hosts } = hostPlanFor(cells);
  const vmMonthly = hosts * plan.monthly;
  const backupMonthly = vmMonthly * provider.backupRateOfVm;

  return {
    cells,
    hosts,
    plan: plan.id,
    admittedCellsPerHost: plan.cellCapacity,
    vmMonthly: money(vmMonthly),
    weeklyBackupMonthly: money(backupMonthly),
    estimatedMonthly: money(vmMonthly + backupMonthly),
  };
});

assert.deepEqual(
  rows.map(({ cells, hosts, plan, admittedCellsPerHost, estimatedMonthly }) => ({
    cells,
    hosts,
    plan,
    admittedCellsPerHost,
    estimatedMonthly,
  })),
  [
    {
      cells: 1,
      hosts: 1,
      plan: "basic-2gib-1vcpu",
      admittedCellsPerHost: 1,
      estimatedMonthly: "$14.40",
    },
    {
      cells: 10,
      hosts: 1,
      plan: "basic-16gib-8vcpu",
      admittedCellsPerHost: 13,
      estimatedMonthly: "$115.20",
    },
    {
      cells: 100,
      hosts: 8,
      plan: "basic-16gib-8vcpu",
      admittedCellsPerHost: 13,
      estimatedMonthly: "$921.60",
    },
  ],
);

console.log(
  JSON.stringify(
    {
      asOf: inputs.asOf,
      currency: inputs.currency,
      admission,
      rows,
    },
    null,
    2,
  ),
);

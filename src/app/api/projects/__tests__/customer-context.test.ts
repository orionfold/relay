import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { customers, projects } from "@/lib/db/schema";
import { POST } from "../route";
import { PATCH } from "../[id]/route";

function request(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project customer context", () => {
  const customerIds: string[] = [];
  const projectIds: string[] = [];

  afterEach(() => {
    if (projectIds.length > 0) {
      db.delete(projects).where(inArray(projects.id, projectIds)).run();
    }
    if (customerIds.length > 0) {
      db.delete(customers).where(inArray(customers.id, customerIds)).run();
    }
    customerIds.length = 0;
    projectIds.length = 0;
  });

  function insertCustomer(name: string) {
    const id = randomUUID();
    customerIds.push(id);
    const now = new Date();
    db.insert(customers)
      .values({
        id,
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${id.slice(0, 6)}`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertProject(customerId: string | null = null) {
    const id = randomUUID();
    projectIds.push(id);
    const now = new Date();
    db.insert(projects)
      .values({
        id,
        name: "Customer project",
        customerId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  it("validates customer references on project create", async () => {
    const customerId = insertCustomer("Northwind");
    const created = await POST(
      request("http://relay.test/api/projects", "POST", {
        name: "Northwind project",
        customerId,
      })
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    projectIds.push(body.id);
    expect(body.customerId).toBe(customerId);

    const missingId = randomUUID();
    const refused = await POST(
      request("http://relay.test/api/projects", "POST", {
        name: "Missing customer project",
        customerId: missingId,
      })
    );
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: `Customer not found: ${missingId}` });
  });

  it("sets, changes, clears, and refuses dangling customer links", async () => {
    const firstCustomerId = insertCustomer("First customer");
    const secondCustomerId = insertCustomer("Second customer");
    const projectId = insertProject();

    for (const customerId of [firstCustomerId, secondCustomerId, null]) {
      const response = await PATCH(
        request(`http://relay.test/api/projects/${projectId}`, "PATCH", {
          customerId,
        }),
        { params: Promise.resolve({ id: projectId }) }
      );
      expect(response.status).toBe(200);
      expect((await response.json()).customerId).toBe(customerId);
    }

    const missingId = randomUUID();
    const refused = await PATCH(
      request(`http://relay.test/api/projects/${projectId}`, "PATCH", {
        customerId: missingId,
      }),
      { params: Promise.resolve({ id: projectId }) }
    );
    expect(refused.status).toBe(404);
    expect(
      db.select({ customerId: projects.customerId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get()?.customerId
    ).toBeNull();
  });
});

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateCustomerSchema } from "@/lib/validators/customer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  return NextResponse.json(customer);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db
    .select({ id: customers.id, sampleSource: customers.sampleSource })
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // slug is intentionally immutable — not accepted by updateCustomerSchema.
  await db
    .update(customers)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.industry !== undefined ? { industry: parsed.data.industry } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(existing.sampleSource ? { sampleState: "sample-edited" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id));

  const updated = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  return NextResponse.json(updated);
}

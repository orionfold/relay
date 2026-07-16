import { NextResponse } from "next/server";
import { z } from "zod";
import { startBuiltinWorkshop } from "@/lib/workshop/runs";
import { workshopErrorPayload } from "@/lib/workshop/errors";

const BodySchema = z
  .object({
    editionId: z.literal("relay-operator-workshop"),
    confirmInstall: z.literal(true),
  })
  .strict();

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Explicit starter installation confirmation is required.",
        code: "invalid_transition",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await startBuiltinWorkshop(), { status: 201 });
  } catch (error) {
    const payload = workshopErrorPayload(error);
    const status =
      payload.code === "install_conflict"
        ? 409
        : payload.code === "relay_version_incompatible"
          ? 412
          : 422;
    return NextResponse.json(payload, { status });
  }
}

import { WORKSHOP_PRODUCTION_HANDOFF } from "@/lib/workshop/handoff";

export async function GET() {
  return new Response(
    `${JSON.stringify(WORKSHOP_PRODUCTION_HANDOFF, null, 2)}\n`,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="relay-operator-workshop-production-handoff.json"',
        "Cache-Control": "no-store",
      },
    }
  );
}

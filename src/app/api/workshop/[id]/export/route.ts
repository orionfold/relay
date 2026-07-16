import { buildWorkshopCompletionBundle } from "@/lib/workshop/export";
import { workshopErrorPayload } from "@/lib/workshop/errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await context.params).id;
    const buffer = await buildWorkshopCompletionBundle(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="relay-workshop-completion-${id.replaceAll(":", "-")}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(workshopErrorPayload(error), { status: 422 });
  }
}

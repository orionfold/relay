import { NextResponse } from "next/server";
import { HostDeploymentMutationSchema } from "@/lib/host/deployment/contracts";
import { HostDeploymentService } from "@/lib/host/deployment/service";
import { hostError } from "@/lib/host/supervisor/errors";

function response(service: HostDeploymentService) {
  return NextResponse.json(service.view(), {
    headers: { "cache-control": "no-store" },
  });
}

function errorResponse(error: unknown) {
  const named = hostError(error, "HOST_DEPLOYMENT_INTERNAL_ERROR");
  const status = named.code.includes("LICENSE") || named.code.includes("GRANT")
    ? 403
    : named.code.includes("BUSY") || named.code.includes("REPLAY")
      ? 409
      : named.code.includes("INTERNAL") || named.code.includes("UNAVAILABLE")
        ? 500
        : 422;
  const publicMessage =
    named.code.includes("INTERNAL") ||
    named.code === "HOST_REGISTRY_UNAVAILABLE" ||
    named.code === "HOST_DEPLOYMENT_STORE_WRITE_FAILED"
      ? "Relay Host deployment could not complete the requested operation. Review local server diagnostics and retry."
      : named.message;
  return NextResponse.json(
    { error: publicMessage, code: named.code },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function GET() {
  try {
    return response(new HostDeploymentService());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "HOST_DEPLOYMENT_REQUEST_INVALID" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const parsed = HostDeploymentMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Relay Host deployment request is invalid.", code: "HOST_DEPLOYMENT_REQUEST_INVALID" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const service = new HostDeploymentService();
    return NextResponse.json(service.mutate(parsed.data), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

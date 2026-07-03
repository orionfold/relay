import { NextRequest, NextResponse } from "next/server";
import {
  createSnapshot,
  listSnapshots,
  getSnapshotsSize,
  isSnapshotLocked,
  SnapshotBusyError,
} from "@/lib/snapshots/snapshot-manager";

/** GET /api/snapshots — list all snapshots with disk usage */
export async function GET() {
  try {
    const [snapshotList, usage] = await Promise.all([
      listSnapshots(),
      getSnapshotsSize(),
    ]);

    return NextResponse.json({
      snapshots: snapshotList,
      totalBytes: usage.totalBytes,
      snapshotCount: usage.snapshotCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list snapshots" },
      { status: 500 }
    );
  }
}

/** POST /api/snapshots — create a manual snapshot */
export async function POST(req: NextRequest) {
  if (isSnapshotLocked()) {
    return NextResponse.json(
      { error: "Another snapshot operation is already in progress" },
      { status: 409 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const label = typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : `Manual snapshot`;

    const snapshot = await createSnapshot(label, "manual");

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    // A lock grabbed between the isSnapshotLocked() check and createSnapshot is
    // still contention, not a server error (issue #24).
    if (error instanceof SnapshotBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create snapshot" },
      { status: 500 }
    );
  }
}

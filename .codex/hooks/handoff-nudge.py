#!/usr/bin/env python3
"""Stop hook — auto-nudge the /handoff skill at session end.

Fires when the main agent stops responding. If the session did substantive work
(touched tracked files AFTER this session's start — derived from the transcript's
first timestamp, so a prior session's uncommitted leftovers don't count), it
injects a one-time reminder to run the
`handoff` skill, which — in auto mode (see .claude/handoff-profile.yaml) — prunes
HANDOFF.md and promotes durable facts to memory WITHOUT operator gating, then
reports what it did. This replaces the old "operator remembers to type /handoff"
step so continuity can't silently drift.

Contract (Claude Code Stop hook):
  - stdin: JSON with {"session_id", "stop_hook_active", "transcript_path", ...}.
  - exit 0 + empty stdout  -> let the stop proceed untouched.
  - stdout JSON {"decision":"block","reason":...} -> feed `reason` back to the
    model and continue the turn (this is how we ask it to run the handoff).

Loop safety (critical): the handoff itself makes many tool calls and will trigger
Stop again. Two guards prevent an infinite loop:
  1. `stop_hook_active` — Claude Code sets this true when the stop was itself
     produced by a hook-continued turn; we bail immediately so we never re-nudge
     a turn we already extended.
  2. A per-session sentinel file (~/.claude-handoff-nudged/<session_id>) — we nudge
     AT MOST ONCE per session, so even across independent stops we ask only once.

Deliberately conservative: on ANY error, or if we can't confirm substantive work,
we exit 0 (let the stop proceed). A handoff missed is recoverable; a wedged
session is not.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def _eprint(*a: object) -> None:
    print(*a, file=sys.stderr)


def _session_start_epoch(transcript_path: str) -> float | None:
    """Earliest ISO-8601 `timestamp` in the transcript = when this session began.

    Returns epoch seconds, or None if the transcript is missing/unreadable/has no
    timestamped entry. A None return means "can't scope to this session" and the
    caller falls back to conservative (no-nudge) behaviour rather than blaming
    pre-existing working-tree changes on a read-only session.
    """
    if not transcript_path:
        return None
    try:
        with open(transcript_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    ts = json.loads(line).get("timestamp")
                except Exception:
                    continue
                if not ts:
                    continue
                # Stored as e.g. "2026-07-05T13:35:02.862Z"; normalise the Z.
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:
                    continue
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.timestamp()
    except Exception:
        return None
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # can't parse -> don't interfere

    # Guard 1: never re-nudge a turn a hook already extended.
    if payload.get("stop_hook_active"):
        return 0

    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        return 0

    # Guard 2: at most one nudge per session.
    sentinel_dir = Path.home() / ".claude-handoff-nudged"
    sentinel = sentinel_dir / session_id
    if sentinel.exists():
        return 0

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

    # Session scoping: only nudge about files THIS session changed. `git status`
    # is working-tree-wide and can't tell session-authored edits from a prior
    # session's uncommitted leftovers, so a read-only Q&A session would otherwise
    # inherit the blame for stale dirty files and nudge forever. We derive the
    # session start from the transcript and only count files modified after it.
    session_start = _session_start_epoch(str(payload.get("transcript_path") or ""))
    if session_start is None:
        return 0  # can't scope -> don't risk a false nudge on leftover changes

    # `git status --porcelain` is cheap and local; empty output means nothing to
    # hand off at all.
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return 0
    if result.returncode != 0:
        return 0

    # Ignore the handoff surfaces themselves (a handoff that already ran this
    # session, or a prior one) so we never nudge about our own writes.
    IGNORED = ("HANDOFF.md", "OPERATOR-REQUIREMENTS.md", "_STATUS.json", "handoff-profile.yaml")

    def _touched_this_session(rel_path: str) -> bool:
        try:
            mtime = (Path(project_dir) / rel_path).stat().st_mtime
        except OSError:
            return False  # deleted/unreadable -> can't attribute to this session
        return mtime >= session_start

    dirty = []
    for ln in result.stdout.splitlines():
        if not ln.strip():
            continue
        # Porcelain line: 2 status chars + space + path (rename shows "old -> new").
        rel = ln[3:].split(" -> ")[-1].strip().strip('"')
        if any(name in rel for name in IGNORED):
            continue
        if _touched_this_session(rel):
            dirty.append(rel)
    if not dirty:
        return 0

    # Record the nudge BEFORE emitting it, so a crash mid-turn can't loop us.
    try:
        sentinel_dir.mkdir(parents=True, exist_ok=True)
        sentinel.write_text("nudged\n")
    except Exception:
        return 0  # if we can't record it, don't risk a loop — skip the nudge

    reason = (
        "Session end: this session changed tracked files but the HANDOFF has not "
        "been updated for it yet. Run the `handoff` skill now to prune HANDOFF.md "
        "and promote any durable facts to memory. It is in AUTO mode "
        "(.claude/handoff-profile.yaml apply_mode: auto) — apply the prune and "
        "memory promotions yourself and report what you did; do not ask first. "
        "If the session was trivial or already handed off, say so in one line and "
        "stop without changes."
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never wedge a session on a hook bug
        _eprint(f"[handoff-nudge] non-fatal: {exc}")
        sys.exit(0)

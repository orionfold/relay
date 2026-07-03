# VHS reference tape — Relay staging CLI first-run + fulfilment (Mode A + C).
#
# THIS IS A REFERENCE/TEMPLATE. `scripts/staging.mjs cli-run` copies it into the
# dated bundle dir as `_cli-first-run.tape` and runs `vhs` from that dir, so the
# relative `Output "cli-first-run.gif"` + `bash run-ceremony.sh` resolve against
# the bundle. `run-ceremony.sh` is GENERATED per run (it bakes in the real CLI
# path + minted-license path, which are only known at run time) and is fully
# self-contained — it exports its own RELAY_DATA_DIR + zeroes the dev gates, so
# the tape needs no `Env`. It runs the SAME command sequence as the headless
# text-log capture, so the GIF and the D4 proof can never diverge.
#
# Fidelity contract: the ceremony invokes the installed CLI at
# `<scratchDir>/node_modules/orionfold-relay/dist/cli.js` with RELAY_DATA_DIR
# pointed at ~/.relay-staging and RELAY_DEV_MODE/RELAY_INSTANCE_MODE zeroed —
# real customer behavior, never the repo's dev-gated `relay` binary. See
# scripts/lib/harness.mjs launchCli/runCliCommand and the S1 relay-staging skill.

Require bash

Output "cli-first-run.gif"

Set Shell bash
Set FontSize 18
Set Width 1100
Set Height 760
Set Padding 20
Set TypingSpeed 40ms

Sleep 1s
Type "bash run-ceremony.sh"
Enter
# The ceremony runs in ~2s standalone; a fixed Sleep captures the whole run with
# comfortable margin inside ttyd. We deliberately do NOT use `Wait /sentinel/`:
# VHS 0.11's line-matcher is unreliable against the ceremony's final line, and
# the headless capture (mode-c-fulfilment.log + D4-proof-summary.txt) is the
# real correctness gate — the GIF only needs to SHOW the run, not assert on it.
Sleep 12s

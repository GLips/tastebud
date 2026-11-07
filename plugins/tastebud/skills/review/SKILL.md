---
name: review
description: Catch Tastebud up on what the owner said since last time, proposing what follows from it, then open the review UI, starting its server if it isn't already running, and listen for the notes the owner leaves there.
disable-model-invocation: true
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/tastebud":*), Monitor
---

This is the owner's catch-up: read what they said since the last one, propose what follows, and hand them the decisions in the review UI. If they only want the UI ("just open it"), skip to **Open the review UI**.

## Catch up

Run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" catalog --guide` and follow its "Catch up" section, using `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud"` for every `tastebud` command. Session batches go to Sonnet subagents (the Agent tool with `model: "sonnet"`), one per batch in parallel; give each its batch command with that same absolute path in place of `tastebud`. Its last step, handing over, is the next section. When no session messages or sources wait, still check each other origin you can reach (or name the ones you can't) before saying there's nothing new.

## Open the review UI

Run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review --open` with the Bash tool's `run_in_background`: when it starts the server it never exits, and when one is already up for this store it opens that and exits. Wait for the line it prints. A server this starts lives as long as this session.

Give the owner the URL from it with what the catch-up proposed. Right then, start listening: run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review listen --as claude-code` under the Monitor tool with `timeout_ms` 1800000 (Monitor's cap, 30 minutes), without `2>&1`: its startup line goes to stderr so only notes become events. Re-arm it on every expiry until the owner says they're done; a note left between runs waits and arrives when it restarts. It never exits and prints each note as a line, which Monitor turns into an event; a `run_in_background` shell reports only on exit and would miss every note. Answer each note with the `reply` command it prints.

If it reports that there is no store, offer to set Tastebud up: with a yes, run `tastebud config-show --guide` and lead the owner through the interview it prints.

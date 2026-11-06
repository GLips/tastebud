---
name: review
description: Open the Tastebud review UI in the browser, starting its server if it isn't already running, and listen for the notes the owner leaves there.
disable-model-invocation: true
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review --open), Bash("${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review listen:*), Monitor
---

Run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review --open` with the Bash tool's `run_in_background`: when it starts the server it never exits, and when one is already up for this store it opens that and exits.

Wait for the line it prints, then give the owner the URL from it. A server this starts lives as long as this session.

Right away, not after a first note, start listening: run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review listen --as claude-code` under the Monitor tool, with the longest timeout, and re-arm it when it expires. It never exits and prints each note as a line, which Monitor turns into an event; a `run_in_background` shell reports only on exit and would miss every note. Answer each note with the `reply` command it prints.

If it reports that there is no store, offer to set Tastebud up: with a yes, run `tastebud config-show --guide` and lead the owner through the interview it prints.

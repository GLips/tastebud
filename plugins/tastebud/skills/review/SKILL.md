---
name: review
description: Open the Tastebud review UI in the browser, starting its server if it isn't already running.
disable-model-invocation: true
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review --open)
---

Run `"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" review --open` with the Bash tool's `run_in_background`: when it starts the server it never exits, and when one is already up for this store it opens that and exits.

Wait for the line it prints, then give the owner the URL from it. A server this starts lives as long as this session.

If it reports that there is no store, point the owner at `/tastebud:setup`.

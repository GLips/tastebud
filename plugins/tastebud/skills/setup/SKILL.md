---
name: setup
description: Set up Tastebud with its owner. Interview them, write the store's tastebud.config.ts after their yes, wire up their agents and prove capture, review and recall end to end.
disable-model-invocation: true
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/tastebud" setup-guide)
---

!`"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" setup-guide`

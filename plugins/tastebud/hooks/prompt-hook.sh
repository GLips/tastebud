#!/bin/sh
# UserPromptSubmit: `tastebud hook prompt`, unless the owner turned the hook off (`prompt_hook` in /config;
# unset means the default, on), there is no store, or the binary isn't downloaded yet. Each of those exits
# before anything starts, so a prompt never waits on a download or pays for a store it doesn't have.
[ "${CLAUDE_PLUGIN_OPTION_PROMPT_HOOK:-true}" != false ] || exit 0
# The store as core resolves it: TASTEBUD_STORE set in settings.json's env reaches here unexpanded.
store="${TASTEBUD_STORE:-$HOME/.tastebud}"
case $store in "~" | "~/"*) store="$HOME${store#\~}" ;; esac
[ -f "$store/tastebud.config.ts" ] || exit 0
plugin_root="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$plugin_root/scripts/binary-path.sh"
[ -x "$tastebud_binary" ] || exit 0
exec "$tastebud_binary" hook prompt

# Sourced, with plugin_root set, by bin/tastebud and hooks/prompt-hook.sh. Sets tastebud_binary: the release
# binary of this plugin's version. It lives in the user cache, not $CLAUDE_PLUGIN_DATA, because the Bash
# tool runs bin/tastebud without that variable and must find the same copy the MCP server uses.
plugin_version="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$plugin_root/.claude-plugin/plugin.json" | head -n 1)"
tastebud_binary="${XDG_CACHE_HOME:-$HOME/.cache}/tastebud/$plugin_version/tastebud"

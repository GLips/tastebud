# Sourced, with plugin_root set, by bin/tastebud and hooks/prompt-hook.sh. Sets tastebud_binary: the release
# binary of this plugin's version. It lives in the user cache, not $CLAUDE_PLUGIN_DATA, because the Bash
# tool runs bin/tastebud without that variable and must find the same copy the MCP server uses.
plugin_version="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$plugin_root/.claude-plugin/plugin.json" | head -n 1)"
tastebud_binary="${XDG_CACHE_HOME:-$HOME/.cache}/tastebud/$plugin_version/tastebud"

# TASTEBUD_BIN runs another tastebud instead of the release, e.g. a checkout linked by `bun run dev:link`
# (~/.bun/bin/tastebud). A bare name could resolve to this plugin's own bin/tastebud, which is on the Bash
# tool's PATH and would exec itself forever, so it must be a path.
tastebud_binary_override=""
if [ -n "${TASTEBUD_BIN:-}" ]; then
  case $TASTEBUD_BIN in "~" | "~/"*) TASTEBUD_BIN="$HOME${TASTEBUD_BIN#\~}" ;; esac
  tastebud_binary="$TASTEBUD_BIN"
  tastebud_binary_override=1
fi

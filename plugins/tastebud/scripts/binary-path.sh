# Sourced, with plugin_root set, by bin/tastebud and hooks/prompt-hook.sh. Sets tastebud_binary: the release
# binary of this package's version. The npm package ships bin/ and scripts/ too, with its package.json as the
# version source, so the plugin and npx at one version share one download. It lives in the user cache, not
# $CLAUDE_PLUGIN_DATA, because the Bash tool runs bin/tastebud without that variable.
version_manifest="$plugin_root/.claude-plugin/plugin.json"
[ -f "$version_manifest" ] || version_manifest="$plugin_root/package.json"
release_version="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$version_manifest" | head -n 1)"
tastebud_binary="${XDG_CACHE_HOME:-$HOME/.cache}/tastebud/$release_version/tastebud"

# TASTEBUD_BIN runs another tastebud instead of the release, e.g. a checkout linked by `bun run dev:link`
# (~/.bun/bin/tastebud). A bare name could resolve to this plugin's own bin/tastebud, which is on the Bash
# tool's PATH and would exec itself forever, so it must be a path.
tastebud_binary_override=""
if [ -n "${TASTEBUD_BIN:-}" ]; then
  case $TASTEBUD_BIN in "~" | "~/"*) TASTEBUD_BIN="$HOME${TASTEBUD_BIN#\~}" ;; esac
  tastebud_binary="$TASTEBUD_BIN"
  tastebud_binary_override=1
fi

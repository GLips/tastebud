#!/bin/sh
# Installs tastebud from a GitHub release: curl -fsSL <this file's URL> | sh
# Downloads the binary for this OS and CPU, checks it against the release's SHA256SUMS, and puts it in
# ~/.local/bin (or $TASTEBUD_INSTALL_DIR). TASTEBUD_INSTALL_VERSION picks a release instead of the latest
# (the Claude Code plugin's bin/tastebud pins its own); TASTEBUD_INSTALL_BASE_URL replaces the release URL, for testing.
# TASTEBUD_INSTALL_SKIP_PATH_HINT=1 drops the PATH advice, for callers that run the binary by its full path.
# The release workflow uploads this file as a release asset, so the curl line and the plugin run the same copy.
set -eu

repo="GLips/tastebud"
if [ -n "${TASTEBUD_INSTALL_VERSION:-}" ]; then
  release_url="https://github.com/$repo/releases/download/v$TASTEBUD_INSTALL_VERSION"
  release_name="v$TASTEBUD_INSTALL_VERSION"
else
  release_url="https://github.com/$repo/releases/latest/download"
  release_name="the latest release"
fi
base_url="${TASTEBUD_INSTALL_BASE_URL:-$release_url}"
install_dir="${TASTEBUD_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "tastebud: no binary for $(uname -s); see https://github.com/$repo/releases" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "tastebud: no binary for $(uname -m); see https://github.com/$repo/releases" >&2; exit 1 ;;
esac

archive="tastebud-$os-$arch.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

download_release_file() {
  curl -fsSL "$base_url/$1" -o "$work/$1" || {
    echo "tastebud: could not download $release_name from $base_url/$1" >&2
    exit 1
  }
}
download_release_file "$archive"
download_release_file SHA256SUMS
expected="$(grep " $archive\$" "$work/SHA256SUMS" | cut -d ' ' -f 1)"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work/$archive" | cut -d ' ' -f 1)"
else
  actual="$(shasum -a 256 "$work/$archive" | cut -d ' ' -f 1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "tastebud: $archive does not match SHA256SUMS; not installing" >&2
  exit 1
fi

tar -xzf "$work/$archive" -C "$work"
mkdir -p "$install_dir"
chmod 755 "$work/tastebud"
# Copied beside the target, then renamed: the rename is atomic, so nothing ever runs a half-written binary.
cp "$work/tastebud" "$install_dir/.tastebud.$$"
mv -f "$install_dir/.tastebud.$$" "$install_dir/tastebud"
echo "Installed $("$install_dir/tastebud" --version) to $install_dir/tastebud"
if [ "${TASTEBUD_INSTALL_SKIP_PATH_HINT:-}" != 1 ]; then
  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *) echo "$install_dir is not on your PATH; add it to run \`tastebud\`." ;;
  esac
fi

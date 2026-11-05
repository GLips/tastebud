#!/bin/sh
# Installs taste from a GitHub release: curl -fsSL <this file's URL> | sh
# Downloads the binary for this OS and CPU, checks it against the release's SHA256SUMS, and puts it in
# ~/.local/bin (or $TASTE_INSTALL_DIR). TASTE_INSTALL_BASE_URL replaces the release URL, for testing.
set -eu

repo="GLips/taste"
base_url="${TASTE_INSTALL_BASE_URL:-https://github.com/$repo/releases/latest/download}"
install_dir="${TASTE_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "taste: no binary for $(uname -s); see https://github.com/$repo/releases" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "taste: no binary for $(uname -m); see https://github.com/$repo/releases" >&2; exit 1 ;;
esac

archive="taste-$os-$arch.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL "$base_url/$archive" -o "$work/$archive"
curl -fsSL "$base_url/SHA256SUMS" -o "$work/SHA256SUMS"
expected="$(grep " $archive\$" "$work/SHA256SUMS" | cut -d ' ' -f 1)"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work/$archive" | cut -d ' ' -f 1)"
else
  actual="$(shasum -a 256 "$work/$archive" | cut -d ' ' -f 1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "taste: $archive does not match SHA256SUMS; not installing" >&2
  exit 1
fi

tar -xzf "$work/$archive" -C "$work"
mkdir -p "$install_dir"
mv "$work/taste" "$install_dir/taste"
chmod 755 "$install_dir/taste"
echo "Installed $("$install_dir/taste" --version) to $install_dir/taste"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "$install_dir is not on your PATH; add it to run \`taste\`." ;;
esac

---
name: release
description: Ship a Tastebud release - pick the version, write the notes, tag, then watch the build and verify npm, the GitHub release and the plugin download.
disable-model-invocation: true
argument-hint: "[x.y.z | patch | minor | major]"
---

# Release Tastebud

Invoking `/release` is Graham's go: ship it without asking again. Stop and ask only when something differs from a
normal release (a failing check you can't fix in the code, something already published, a change to the trust setup).

## What a release is

`bun run release <x.y.z> --notes <file>` (`scripts/release/release.ts`) bumps the version in
`tastebud-version.ts`, the plugin manifest and the README's host lines, runs the gate, commits `Release v<x.y.z>`,
and pushes only an annotated tag whose message is the notes. The tag starts `.github/workflows/release.yml`: it
builds four binaries, creates the GitHub release with the tag's notes, then publishes `tastebud` to npm through
trusted publishing (no token; the `npm` GitHub environment). main is pushed last, after verifying: the marketplace
serves the plugin from main, so a bumped plugin version there before its binary exists breaks new installs.

## Steps

1. **What's new.** `git describe --tags --abbrev=0` gives the last release; `git log <tag>..HEAD --format='%h %s'`
   gives what it adds. Nothing user-facing since then: say so and stop.
2. **The version.** Use `$ARGUMENTS` when given (`patch`/`minor`/`major` bump the current one). Otherwise, while the
   version is below 1.0: `minor` for new capability or anything that breaks an existing setup, `patch` for fixes,
   docs and internals. Say which and why in one line.
3. **The notes**, in a temp file. For the people who use Tastebud, not for us: what they can now do, what got fixed,
   and anything they must change (a config field, a reinstall). Group under `## New`, `## Fixes`, `## Changes`, in
   plain words, one line each. Leave out lint, tests and refactors that change nothing for a user.
4. **Ship.** `bun run release <x.y.z> --notes <file>`. It refuses to run off `main`, with tracked changes, or
   behind/ahead of `origin/main`. If the gate fails, nothing was committed or pushed: `git checkout` the three bumped
   files, fix the code the usual way, and run it again.
5. **Watch.** `gh run list --repo GLips/tastebud --workflow release.yml --limit 1`, then
   `gh run watch <id> --repo GLips/tastebud --exit-status` in the background. macOS arm64 runners can queue for minutes.
6. **Verify the real thing**, in clean environments (`env -i`, a temp `HOME` and `XDG_CACHE_HOME`, no Bun on PATH):
   - `gh release view v<x.y.z>`: four `tastebud-*.tar.gz`, `SHA256SUMS`, `install.sh`, and the notes.
   - `npm view tastebud dist-tags`: `latest` is the new version. npm takes a few minutes; poll, don't fail early.
   - `npx -y tastebud@<x.y.z> --version`, twice: the first downloads the binary, the second runs from the cache.
   - `plugins/tastebud/bin/tastebud --version` from a clean cache: the plugin's own download, checked against
     `SHA256SUMS`.
7. **Push main**: `git push origin main`. Only now do new plugin installs get the new version. If a session ends
   before this step, the release is otherwise complete: verify, then push.
8. **Report** the version, the release URL, and what was verified.

## When the workflow fails

- **Before anything is published** (no GitHub release, `npm view tastebud@<x.y.z>` 404s): commit the fix on top
  of the release commit (main is still unpushed), then move the tag onto it (`git tag -fa --cleanup=verbatim v<x.y.z> -m "$(git tag -l --format='%(contents)' v<x.y.z>)" <sha>` and
  `git push -f origin v<x.y.z>`), which starts a fresh run. Graham allows this only while nothing is published. A
  flaky step can just be re-run with `gh run rerun <id> --failed`.
- **The GitHub release exists but npm failed:** `gh run rerun <id> --failed` re-runs only the publish job.
- **npm already has the version:** it can never be changed or reused. Fix forward with the next patch release.
- **npm refuses the OIDC publish:** the trust link names `release.yml` and the `npm` environment; renaming either
  breaks it. Graham re-creates it in his own terminal (it needs his 2FA):
  `npm trust github tastebud --file release.yml --repo GLips/tastebud --env npm --allow-publish`.

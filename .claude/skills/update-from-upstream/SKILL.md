---
name: update-from-upstream
description: Rebuild this Paseo web client's dist bundle from a new upstream Paseo release tag and redeploy it. Use when upgrading to a newer Paseo version or regenerating the bundle.
---

# Update the web client to a new Paseo release

The bundle in `dist/` = official `packages/app` web export at a release tag +
`patches/katex-math-rendering.patch`. Rebuild in a throwaway clone
(`/tmp/paseo-build`); nothing long-lived exists outside this folder.

## Work from intent, not from a frozen script

Upstream renames npm scripts, moves packages and changes build tooling between
releases. Any command sequence written down in the past — including earlier
versions of this skill — may not apply to the tag you are building. Confirm
each step against the upstream tree at the target tag (root and
`packages/app/package.json` scripts, upstream CI/docs) instead of assuming.
The concrete shape at v0.8.0 was `npm install && npm run build:app-deps`, then
`npx expo export --platform web --clear` from `packages/app` — expect this to
drift and re-derive it per release. On the author's machine, pass
`--cache /tmp/npm-cache-paseo` to npm install (broken `~/.npm` permissions).

## What must hold (the invariants — each one cost real time)

1. The patch series is applied on top of the release tag. Try `git am`; if
   hunks fail, use `git am --3way` (fetch the tag the series was based on) or
   rebase by hand, then regenerate the series with
   `git format-patch <tag> --stdout > patches/katex-math-rendering.patch` and
   commit the refreshed patch here.
2. The patch's own tests still pass. Find them near the patched files (e.g.
   `packages/app/src/utils/markdown-parser.test.ts`) and run them with the
   workspace's test runner.
3. The web export bakes `EXPO_PUBLIC_LOCAL_DAEMON=127.0.0.1:11735`, so the
   default "local" host points at this client's tunnel port, not the daemon's
   6767 (whose Origin gate rejects browsers). Web builds only — never set it
   for a desktop build; it makes `shouldStartBuiltInDaemon()` return false and
   the bundled daemon never starts.
4. Metro's cache is cleared for the export (`--clear` at v0.8.0). A warm cache
   silently reuses the old env value.
5. The result replaces this repo's `dist/` with the exported
   `packages/app/dist`; the throwaway clone is deleted afterwards.

## Verify

1. Restart the service (on the author's machine:
   `launchctl kickstart -k gui/$(id -u)/dev.wangfh.paseo-web-client`;
   elsewhere: restart whatever supervisor runs `serve.mjs`).
2. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:11735/` → 200.
3. Local-daemon tunnel handshake:
   `node -e 'const ws=new WebSocket("ws://127.0.0.1:11735/ws");ws.onopen=()=>process.exit(0);ws.onerror=()=>process.exit(1)'`
4. In a real browser (headless Chrome via Playwright with `channel: "chrome"`
   works): workspace list renders from the local daemon; a session containing
   LaTeX (`$$…$$` or `\[…\]`) renders `.katex` elements; no pageerror crashes
   the app. If no existing session has LaTeX, create a throwaway one
   (`paseo run -d --provider <p> 'Reply with exactly: $$E=mc^2$$'`), verify,
   then archive it.
5. Bump the version reference in `README.md` ("Paseo vX.Y.Z") and commit
   `dist/` + README (and the refreshed patch, if regenerated) together.

---
name: update-from-upstream
description: Rebuild this Paseo web client's dist bundle from a new upstream Paseo release tag and redeploy it. Use when upgrading to a newer Paseo version or regenerating the bundle.
---

# Update the web client to a new Paseo release

The bundle in `dist/` = official `packages/app` web export at a release tag +
`patches/katex-math-rendering.patch`. Everything is rebuilt in a throwaway
clone; nothing long-lived exists outside this folder.

## Steps

Run from anywhere; `CLIENT` = this folder's absolute path.

1. Clone the target release and apply the patch series:

   ```bash
   rm -rf /tmp/paseo-build
   git clone --depth 1 -b vX.Y.Z https://github.com/getpaseo/paseo.git /tmp/paseo-build
   cd /tmp/paseo-build
   git am "$CLIENT/patches/katex-math-rendering.patch"
   ```

   If `git am` fails, the upstream markdown pipeline changed — rebase the two
   patch commits by hand, regenerate the series with
   `git format-patch vX.Y.Z --stdout > "$CLIENT/patches/katex-math-rendering.patch"`,
   and commit the updated patch here.

2. Install and build the workspace packages the app imports:

   ```bash
   npm install --no-audit --no-fund --cache /tmp/npm-cache-paseo
   npm run build:app-deps
   ```

   (`--cache` works around a broken `~/.npm` permissions situation on this
   machine; drop it if yours is healthy.)

3. Sanity-check the patch still passes its own tests:

   ```bash
   npm run test -w @getpaseo/app -- src/utils/markdown-parser.test.ts
   ```

4. Export the web bundle. Both flags are load-bearing:

   ```bash
   (cd packages/app && EXPO_PUBLIC_LOCAL_DAEMON=127.0.0.1:11735 \
     npx expo export --platform web --clear)
   ```

   - Without `EXPO_PUBLIC_LOCAL_DAEMON` the default "local" host points at
     port 6767 directly and dies on the daemon's Origin gate.
   - Without `--clear`, Metro reuses its cache and silently bakes the **old**
     env value.
   - This override is for the web build only; never use it for a desktop
     build (it disables the bundled daemon startup).

5. Swap in the new bundle and clean up:

   ```bash
   rm -rf "$CLIENT/dist"
   cp -R packages/app/dist "$CLIENT/dist"
   cd / && rm -rf /tmp/paseo-build
   ```

## Verify

1. Restart the service: `launchctl kickstart -k gui/$(id -u)/dev.wangfh.paseo-web-client`
   (or rerun `node serve.mjs`).
2. `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:11735/` → 200.
3. Drive headless Chrome (`channel: "chrome"` via Playwright, or a real
   browser) through: workspace list renders from the local daemon; open a
   session known to contain LaTeX (e.g. one with `$$...$$` or `\(...\)`);
   confirm `.katex` elements appear and no error boundary fires.
4. Bump the version reference in `README.md` ("Paseo vX.Y.Z") and commit
   `dist/` + README together.

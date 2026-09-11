# Paseo Web Client

A pure, zero-dependency web client for [Paseo](https://paseo.sh) daemons — the
**official Paseo UI** (same code as the desktop/mobile app) exported for the
browser, plus **KaTeX math rendering**, served by a single ~120-line Node.js
script. No Electron, no bundled daemon, no build step required to run it.

```
node serve.mjs     # that's it — open http://127.0.0.1:11735
```

## What you get

- The exact native Paseo experience in a browser: workspaces, agent timelines,
  terminals, diffs, themes — compiled from the official `packages/app` source.
- LaTeX math in agent output: `$...$`, `$$...$$`, and LaTeX-standard
  `\(...\)` / `\[...\]` delimiters, rendered with KaTeX (Computer Modern fonts
  inlined, dark-mode aware).
- Connects to any number of Paseo daemons, local or remote (e.g. over
  Tailscale).
- No daemon functionality of its own — it is purely a client.

## Requirements

- Node.js ≥ 18 (no npm dependencies; `node:http`/`node:net` only).
- One or more running Paseo daemons (official desktop app or `paseo daemon`),
  reachable over TCP.

## Quick start

```bash
git clone https://github.com/wangfh5/paseo-web-client.git
cd paseo-web-client
cp config.example.json config.json   # then edit to taste
node serve.mjs
```

Open http://127.0.0.1:11735 — the local daemon (`config.local`, default
`127.0.0.1:6767`) is already connected. To make it feel like a desktop app,
use Safari → File → Add to Dock, or Chrome → Save & share → Install page as
app (the bundle ships a PWA manifest).

> The prebuilt bundle in `dist/` has `127.0.0.1:11735` baked in as the default
> local host. If you change `port`, rebuild the bundle (see
> [Updating](#updating-to-a-new-paseo-release)) or the "local" host entry will
> point at the wrong port.

## Connecting remote daemons

Browsers always send an `Origin` header on WebSocket upgrades (and JS cannot
remove it); Paseo daemons reject upgrades whose Origin is not trusted. To let
this client reach a remote daemon directly, add the client's origin to that
daemon's whitelist in `~/.paseo/config.json` **on the remote host**:

```json
{ "daemon": { "cors": { "allowedOrigins": ["https://app.paseo.sh", "http://127.0.0.1:11735"] } } }
```

Keep the default `https://app.paseo.sh` entry. The change takes effect on
write — no daemon restart needed. Then in the web UI: **Settings → Add host →
Direct**, with the daemon's real address, e.g. `100.64.0.7` port `6767`. Host
profiles live in the browser's localStorage — add once per browser.

`Origin: http://127.0.0.1:11735` is just a header declaring *which page*
opened the connection (your browser's address bar), not a network source
address — the daemon compares that string against its whitelist and does not
care where the TCP connection came from. If you serve this client on a
different port, add that origin instead.

The daemon must of course be network-reachable: either listening on a
non-loopback interface, or exposed on its Tailscale address via
`tailscale serve`.

## Running as a background service

Templates ship in `service/` — substitute the three placeholders and install:

**macOS (launchd):**

```bash
sed -e "s|__NODE__|$(which node)|" -e "s|__DIR__|$PWD|" -e "s|__HOME__|$HOME|" \
  service/com.paseo.web-client.plist > ~/Library/LaunchAgents/com.paseo.web-client.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.paseo.web-client.plist
```

**Linux (systemd user unit):**

```bash
sed -e "s|__NODE__|$(which node)|" -e "s|__DIR__|$PWD|" \
  service/paseo-web-client.service > ~/.config/systemd/user/paseo-web-client.service
systemctl --user enable --now paseo-web-client
```

Both restart the client on crash and start it at login. Any other supervisor
works too — it is a single long-lived `node serve.mjs` process.

## Updating to a new Paseo release

The bundle is built from the official repo at a release tag, with the patch
series in `patches/` applied on top. There is no fork or long-lived checkout —
rebuild in a throwaway clone, swap `dist/`, done.

**Do not treat any written-down command sequence as authoritative.** Upstream
renames npm scripts, moves packages and changes build tooling between
releases; commands pasted from an older release's notes will silently rot and
mislead. Work from intent and confirm every command against the upstream tree
at the tag you are building (root and `packages/app/package.json` scripts,
upstream CI/docs):

1. Clone the tag and apply `patches/katex-math-rendering.patch` (`git am`; if
   hunks fail, use `git am --3way` or rebase the series by hand and regenerate
   it with `git format-patch`, committing the refreshed patch here).
2. Install dependencies and build whatever workspace packages the app needs —
   discover how at that tag (e.g. the root `build:app-deps` script at v0.8.0).
3. Run the patch's own tests (near the patched files, e.g.
   `packages/app/src/utils/markdown-parser.test.ts`).
4. Export the web bundle from `packages/app` with Expo. Two invariants are
   load-bearing, whatever the exact flags are at that tag:
   - `EXPO_PUBLIC_LOCAL_DAEMON=127.0.0.1:11735` must be set for the **web**
     build, so the baked default "local" host points at this client's tunnel
     port instead of 6767 (whose Origin gate would reject the browser).
     Never set it for a desktop build — it makes
     `shouldStartBuiltInDaemon()` return false and the bundled daemon never
     starts.
   - Metro's cache must be cleared for the export (`--clear` at v0.8.0);
     a warm cache silently reuses the old env value.
5. Replace this repo's `dist/` with the exported `packages/app/dist`.

Then verify (checklist in `AGENTS.md`): service restarts, `GET /` → 200, the
`/ws` handshake to the local daemon succeeds, and in a real or headless
browser the workspace list renders and a session containing `$$…$$` shows
`.katex` elements with no page errors. Bump the version reference above and
commit `dist/` + README together.

For agents working in this repo, the same guidance is codified as the local
skill `.claude/skills/update-from-upstream/SKILL.md`.

## Repository layout

| Path | What it is |
|------|------------|
| `serve.mjs` | The entire server: static files + WS tunnel to the local daemon. Zero deps. |
| `config.example.json` | Template; copy to `config.json` (git-ignored). |
| `dist/` | Prebuilt official UI + KaTeX (Paseo v0.8.0 + `patches/`). |
| `patches/` | The complete delta vs upstream, as a `git am`-able series. |
| `service/` | launchd / systemd templates for running as a background service. |
| `.claude/skills/update-from-upstream/` | Local agent skill for rebuilds. |

## License & attribution

The server, config and patches in this repo are released under the Apache
License 2.0. `dist/` is compiled from [getpaseo/paseo](https://github.com/getpaseo/paseo)
(Apache License 2.0, © Mohamed Boudra) with the patches in `patches/` applied;
KaTeX fonts are © their respective authors under the OFL — see the upstream
projects for their full license texts.

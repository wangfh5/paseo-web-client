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

Any supervisor works. On macOS (launchd), a LaunchAgent with
`ProgramArguments: [/opt/homebrew/bin/node, .../serve.mjs]`, `RunAtLoad` and
`KeepAlive` is enough; on Linux use a systemd user unit with
`ExecStart=/usr/bin/node /path/to/serve.mjs`. See `AGENTS.md` for the author's
own setup.

## Updating to a new Paseo release

The bundle is built from the official repo at a release tag, with the single
patch series in `patches/` applied on top. Everything needed to rebuild is in
this folder — no fork or long-lived checkout required:

```bash
git clone --depth 1 -b vX.Y.Z https://github.com/getpaseo/paseo.git /tmp/paseo-build
cd /tmp/paseo-build
git am /path/to/paseo-web-client/patches/katex-math-rendering.patch
npm install --no-audit --no-fund && npm run build:app-deps
(cd packages/app && EXPO_PUBLIC_LOCAL_DAEMON=127.0.0.1:11735 \
  npx expo export --platform web --clear)
rm -rf /path/to/paseo-web-client/dist
cp -R packages/app/dist /path/to/paseo-web-client/dist
cd / && rm -rf /tmp/paseo-build
```

Gotchas (each cost us real time):

- `EXPO_PUBLIC_LOCAL_DAEMON=127.0.0.1:11735` is **required** for the web build
  (it bakes the default host pointing at the local tunnel) and `--clear` is
  mandatory — Metro's cache ignores env changes.
- Never set that variable when building the **desktop** app: it makes
  `shouldStartBuiltInDaemon()` return false and the bundled daemon never
  starts.
- unistyles v3's web `withUnistyles` does not inject a `theme` prop; themed
  values must flow through the mappings callback (already handled by the
  patch).

For agents working in this repo, the same workflow is codified as the local
skill `.claude/skills/update-from-upstream/SKILL.md`.

## Repository layout

| Path | What it is |
|------|------------|
| `serve.mjs` | The entire server: static files + WS tunnel to the local daemon. Zero deps. |
| `config.example.json` | Template; copy to `config.json` (git-ignored). |
| `dist/` | Prebuilt official UI + KaTeX (Paseo v0.7.2 + `patches/`). |
| `patches/` | The complete delta vs upstream, as a `git am`-able series. |
| `.claude/skills/update-from-upstream/` | Local agent skill for rebuilds. |

## License & attribution

The server, config and patches in this repo are released under the Apache
License 2.0. `dist/` is compiled from [getpaseo/paseo](https://github.com/getpaseo/paseo)
(Apache License 2.0, © Mohamed Boudra) with the patches in `patches/` applied;
KaTeX fonts are © their respective authors under the OFL — see the upstream
projects for their full license texts.

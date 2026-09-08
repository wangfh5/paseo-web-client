# AGENTS.md

Guidance for agents working in this folder. Human-facing usage is in
`README.md`; this file is about **maintaining** the tool.

## What this folder is

A self-contained Paseo web client: the official `packages/app` web export
(prebuilt in `dist/`) plus a zero-dependency Node server (`serve.mjs`). There
is no upstream checkout here and no fork to keep in sync — the entire delta we
own lives in `patches/katex-math-rendering.patch`.

## Hard rules

- **`dist/` is a build artifact.** Never edit files inside it; rebuild from
  upstream instead (see below).
- **`serve.mjs` stays dependency-free.** Node stdlib only (`node:http`,
  `node:net`, `node:fs`). If a feature needs an npm package, stop and ask.
- **`config.json` is local state** (real daemon addresses) and git-ignored.
  Changing the schema means updating `config.example.json` and the README in
  the same commit.
- Keep the baked endpoint and the default port in sync: the bundle has
  `127.0.0.1:11735` compiled in as the default local host, so `port: 11735`
  in the example config is load-bearing.

## Updating to a new Paseo release

Use the local skill `.claude/skills/update-from-upstream/SKILL.md` — it has
the exact command sequence and the verification steps. Do not improvise a
different build path; every step in that skill exists because skipping it
broke something before.

## Verifying changes

- `node serve.mjs` must start and print its listening line.
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:11735/` → 200.
- Local-daemon tunnel handshake:
  `node -e 'const ws=new WebSocket("ws://127.0.0.1:11735/ws");ws.onopen=()=>process.exit(0);ws.onerror=()=>process.exit(1)'`
- After a dist rebuild, open the UI in a real browser (headless Chrome via
  Playwright with `channel: "chrome"` works) and confirm: workspace list
  renders, a session containing LaTeX renders `.katex` elements, and no
  pageerror crashes the app.

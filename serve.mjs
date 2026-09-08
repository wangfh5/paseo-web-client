// Paseo web client server: serves the static web export (dist/) and gives the
// browser a way to reach Paseo daemons, which only accept WS upgrades whose
// Origin header is absent, same-origin, or allowlisted — browsers always send
// Origin and JS cannot remove it. So for each daemon this process listens on a
// loopback port and replays the upgrade without Origin, then pipes raw bytes.
//
//   node serve.mjs            # one command starts everything
//
// Ports and daemons live in config.json next to this file. Zero dependencies.
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("./", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const config = JSON.parse(await readFile(join(ROOT, "config.json"), "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

// Replay the browser's WS upgrade against a daemon without the Origin header,
// forward the daemon's real handshake (101 or rejection), then tunnel frames.
function onUpgrade(target, req, socket) {
  const [host, port] = target.split(":");
  const daemon = createConnection({ host, port: Number(port) }, () => {
    const lines = [
      `GET /ws HTTP/1.1`,
      `Host: ${target}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"] ?? ""}`,
      `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"] ?? "13"}`,
    ];
    for (const h of ["sec-websocket-protocol", "sec-websocket-extensions"]) {
      if (req.headers[h]) lines.push(`${h}: ${req.headers[h]}`);
    }
    daemon.write(lines.join("\r\n") + "\r\n\r\n");
    let head = Buffer.alloc(0);
    const onHandshake = (chunk) => {
      head = Buffer.concat([head, chunk]);
      const idx = head.indexOf("\r\n\r\n");
      if (idx === -1) return;
      daemon.off("data", onHandshake);
      socket.write(head.subarray(0, idx + 4));
      const statusLine = head.subarray(0, head.indexOf("\r\n")).toString();
      if (statusLine.includes(" 101")) {
        socket.write(head.subarray(idx + 4));
        socket.pipe(daemon).pipe(socket);
      } else {
        console.error(`[ws] ${target} rejected: ${statusLine}`);
        cleanup();
      }
    };
    daemon.on("data", onHandshake);
  });
  const cleanup = () => {
    socket.destroy();
    daemon.destroy();
  };
  socket.on("error", cleanup);
  daemon.on("error", cleanup);
  socket.on("close", cleanup);
  daemon.on("close", cleanup);
}

// Main server: static files + /ws tunnel to the local daemon.
const ui = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    let file = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    try {
      if (!file.startsWith(DIST)) throw new Error("traversal");
      await stat(file);
    } catch {
      file = join(DIST, "index.html"); // SPA fallback
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": file.includes("/_expo/static/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
});
ui.on("upgrade", (req, socket) => onUpgrade(config.local, req, socket));
ui.listen(config.port, config.host, () => {
  console.log(`Paseo web client: http://${config.host}:${config.port}/  (/ws -> ${config.local})`);
});

// One WS-only forwarder per remote daemon; add hosts in the UI as
// Direct 127.0.0.1:<listen>.
for (const remote of config.remotes ?? []) {
  const fwd = createServer((req, res) => {
    res.writeHead(426).end("WebSocket upgrade required");
  });
  fwd.on("upgrade", (req, socket) => onUpgrade(remote.target, req, socket));
  fwd.listen(remote.listen, config.host, () => {
    console.log(`  forward: ws://${config.host}:${remote.listen}/ws -> ${remote.target} (${remote.name})`);
  });
}

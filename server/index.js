// Party Panic server: serves the built client from /public and hosts the multiplayer hub.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './rooms/roomManager.js';
import { attachHub } from './net/hub.js';
import { CONFIG, log } from './config.js';
import { loopStats, stopLoop } from './match/loop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

// Static files are cached in memory (with a gzip copy for text) and revalidated with ETags,
// so a redeploy is picked up on the next load while repeat visits cost a 304.
const fileCache = new Map();
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);

function loadFile(file, cb) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return cb(err || new Error('not a file'));
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const hit = fileCache.get(file);
    if (hit && hit.etag === etag) return cb(null, hit);
    fs.readFile(file, (err2, data) => {
      if (err2) return cb(err2);
      const ext = path.extname(file);
      const entry = { etag, data, gz: COMPRESSIBLE.has(ext) && data.length > 1024 ? zlib.gzipSync(data, { level: 9 }) : null, ext };
      if (fileCache.size > 200) fileCache.clear();
      fileCache.set(file, entry);
      cb(null, entry);
    });
  });
}

function serveStatic(req, res, file) {
  loadFile(file, (err, f) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const headers = {
      'content-type': MIME[f.ext] || 'application/octet-stream',
      'cache-control': f.ext === '.woff' || f.ext === '.woff2' ? 'public, max-age=86400' : 'no-cache',
      etag: f.etag,
      vary: 'accept-encoding',
    };
    if (req.headers['if-none-match'] === f.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    let body = f.data;
    if (f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = f.gz;
      headers['content-encoding'] = 'gzip';
    }
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

export function createServer({ port = CONFIG.port, host = CONFIG.host } = {}) {
  const manager = new RoomManager();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size, tick: { avgMs: +loopStats.avgStepMs.toFixed(3), maxMs: +loopStats.maxStepMs.toFixed(3) } }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.resolve(PUBLIC_DIR, '.' + rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
    serveStatic(req, res, file);
  });
  const hub = attachHub(server, manager);
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        manager,
        port: addr.port,
        close: (message) => new Promise((r) => {
          hub.close();
          manager.dispose(message);
          stopLoop();
          server.close(() => r());
          // Give the "room closed" messages a moment to reach players before disconnecting.
          setTimeout(() => { for (const ws of hub.wss.clients) ws.terminate(); }, message ? 250 : 0);
        }),
      });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!fs.existsSync(path.join(PUBLIC_DIR, 'assets', 'main.js'))) {
    console.warn('The client bundle is missing. Run "npm run build" first, or the page will not load.');
  }
  createServer().then((srv) => {
    log(`Party Panic server running on http://localhost:${srv.port}`);
    // Hosts such as Render send SIGTERM before a restart or redeploy: tell players their
    // room closed instead of leaving them on a frozen screen.
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      log('Shutting down');
      srv.close('The server is restarting, so this room has closed. Create a new room in a minute to keep playing.').finally(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  });
}

// Headless network client used by integration tests. Speaks the real protocol over a real
// WebSocket connection, exactly like the browser client.
import WebSocket from 'ws';

export class NetClient {
  constructor(url, name = 'Bot') {
    this.url = url;
    this.name = name;
    this.rid = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.room = null;
    this.phase = null;
    this.snaps = 0;
    this.lastSnap = null;
    this.toasts = [];
    this.seq = 0;
    this.playerId = null;
    this.token = null;
    this.code = null;
    this.closedByServer = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => resolve(this));
      this.ws.on('error', reject);
      this.ws.on('message', (data) => this.onMessage(JSON.parse(data.toString())));
      this.ws.on('close', () => { this.closed = true; });
    });
  }

  onMessage(m) {
    if (m.type === 'ack') {
      const p = this.pending.get(m.rid);
      if (p) { this.pending.delete(m.rid); p(m); }
      return;
    }
    if (m.type === 'room') this.room = m.room;
    if (m.type === 'phase') this.phase = m;
    if (m.type === 'snap') { this.snaps++; this.lastSnap = m; }
    if (m.type === 'toast') this.toasts.push(m.text);
    if (m.type === 'replaced' || m.type === 'roomClosed') this.closedByServer = m.type;
    const hs = this.handlers.get(m.type);
    if (hs) for (const h of hs) h(m);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  send(obj) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  request(type, payload = {}) {
    const rid = ++this.rid;
    return new Promise((resolve) => {
      this.pending.set(rid, resolve);
      this.send({ type, rid, ...payload });
    });
  }

  async create() {
    const r = await this.request('create', { name: this.name });
    if (r.ok) this.adopt(r.data);
    return r;
  }

  async join(code) {
    const r = await this.request('join', { code, name: this.name });
    if (r.ok) this.adopt(r.data);
    return r;
  }

  async rejoin(code, token) {
    const r = await this.request('rejoin', { code, token });
    if (r.ok) this.adopt(r.data);
    return r;
  }

  adopt(d) {
    this.code = d.code;
    this.playerId = d.playerId;
    this.token = d.token;
    this.room = d.room;
    this.phase = d.phase;
  }

  sendInputs(list) {
    this.send({ type: 'in', i: list });
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }

  waitFor(pred, timeoutMs = 5000, label = 'condition') {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        let ok = false;
        try { ok = pred(this); } catch { ok = false; }
        if (ok) { clearInterval(iv); resolve(this); }
        else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); reject(new Error(`Timed out waiting for ${label}`)); }
      }, 10);
    });
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

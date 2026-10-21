// WebSocket connection with automatic reconnection, request/acknowledgement, events and
// clock synchronisation against the server's monotonic clock.

export class Connection {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.rid = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.state = 'connecting';
    this.retry = 0;
    this.clockOffset = 0; // serverTime - performance.now()/1000
    this.rtt = 0.1;
    this.samples = [];
    this.pingTimer = null;
    this.stopped = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, data) {
    const hs = this.handlers.get(type);
    if (hs) for (const h of hs) h(data);
  }

  setState(s) {
    this.state = s;
    this.emit('state', s);
  }

  connect() {
    this.stopped = false;
    this.setState(this.retry ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setState('online');
      this.samples = [];
      this.ping();
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 2000);
      this.emit('open');
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'ack') {
        const p = this.pending.get(m.rid);
        if (p) { this.pending.delete(m.rid); clearTimeout(p.timer); p.resolve(m); }
        return;
      }
      if (m.type === 'pong') { this.onPong(m); return; }
      if (m.type === 'welcome') this.setOffsetGuess(m.serverNow);
      this.emit(m.type, m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'disconnected', message: 'Lost connection to the server.' }); }
      this.pending.clear();
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        this.setState('offline');
        this.emit('close');
        this.scheduleReconnect();
      }
    };
    ws.onerror = () => {};
  }

  scheduleReconnect() {
    const delay = Math.min(5000, 400 * 2 ** this.retry);
    this.retry++;
    setTimeout(() => { if (!this.stopped) this.connect(); }, delay);
  }

  get online() {
    return !!this.ws && this.ws.readyState === 1;
  }

  send(obj) {
    if (this.online) this.ws.send(JSON.stringify(obj));
  }

  request(type, payload = {}, timeoutMs = 8000) {
    if (!this.online) return Promise.resolve({ ok: false, error: 'offline', message: 'Not connected to the server yet. Retrying…' });
    const rid = ++this.rid;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve({ ok: false, error: 'timeout', message: 'The server took too long to answer. Try again.' });
      }, timeoutMs);
      this.pending.set(rid, { resolve, timer });
      this.send({ type, rid, ...payload });
    });
  }

  // ---------------------------------------------------------------- clock sync

  localNow() {
    return performance.now() / 1000;
  }

  serverNow() {
    return this.localNow() + this.clockOffset;
  }

  setOffsetGuess(serverNow) {
    if (!this.samples.length) this.clockOffset = serverNow - this.localNow();
  }

  ping() {
    this.send({ type: 'ping', c: this.localNow() });
  }

  onPong(m) {
    const t = this.localNow();
    const rtt = Math.max(0, t - m.c);
    const offset = m.s + rtt / 2 - t;
    this.samples.push({ rtt, offset });
    if (this.samples.length > 10) this.samples.shift();
    // Use the lowest-latency samples: they have the least asymmetric delay.
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    this.clockOffset = best.reduce((s, x) => s + x.offset, 0) / best.length;
    this.rtt = this.samples.reduce((s, x) => s + x.rtt, 0) / this.samples.length;
    this.emit('rtt', this.rtt);
  }
}

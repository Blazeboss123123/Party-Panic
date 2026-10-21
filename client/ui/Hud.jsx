import React from 'react';
import { hud, useStore } from '../state/store.js';
import { settings, keyLabel } from '../settings.js';
import { META_BY_ID } from '../../shared/games/meta.js';
import { ControlsList, Kbd, Panel, BindingKeys } from './components.jsx';

function fmt(t) {
  const s = Math.ceil(t);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : String(s);
}

export function Hud() {
  const h = useStore(hud);
  const showNet = useStore(settings, (s) => s.showFps);
  const bindings = useStore(settings, (s) => s.bindings);
  if (!h.active) return null;
  const meta = META_BY_ID[h.gameId];
  const urgent = h.started && h.timeLeft <= 10 && !h.ended;
  return (
    <>
      <div className="hud-top">
        <div className={`timer-pill ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`${Math.ceil(h.timeLeft)} seconds left`}>{fmt(h.timeLeft)}</div>
        {h.bar && (
          <div className="team-bar" aria-label={h.bar.label}>
            <div style={{ width: '50%', background: h.bar.left }} />
            <div style={{ width: '50%', background: h.bar.right }} />
            <div className="marker" style={{ left: `${(0.5 + h.bar.value * 0.5) * 100}%` }} />
          </div>
        )}
        {h.bar && <div className="row small" style={{ width: '28rem', justifyContent: 'space-between', fontWeight: 800, color: '#fff', textShadow: '0 2px 0 #2b1b5a' }}><span>{h.bar.leftLabel}</span><span>{h.bar.rightLabel}</span></div>}
      </div>

      <div className="hud-tl">
        <Panel className="tight">
          <div className="game">{h.title}</div>
          <p className="small" style={{ fontWeight: 700 }}>{h.objective}</p>
          {h.lines?.length > 0 && (
            <div className="hud-lines">
              {h.lines.map((l, i) => <div className="hud-line" key={i}><span>{l.label}</span><b>{l.value}</b></div>)}
            </div>
          )}
        </Panel>
      </div>

      {h.board?.length > 0 && (
        <div className="hud-tr">
          <Panel className="tight">
            {h.boardTitle && <h3 style={{ marginBottom: '0.3rem' }}>{h.boardTitle}</h3>}
            {h.board.map((b, i) => (
              <div key={i} className={`board-row ${b.me ? 'me' : ''}`}>
                <span className="seat" style={{ background: b.color, width: '1.5rem', height: '1.5rem', fontSize: '0.8rem' }}>{b.seat}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: b.out ? 0.5 : 1 }}>{b.name}</span>
                <span className="v">{b.value}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {meta && !h.ended && (
        <div className="hud-bl small">
          <ControlsList controls={meta.controls} />
          <span className="control"><Kbd>Esc</Kbd> Menu</span>
        </div>
      )}

      {h.cooldowns?.length > 0 && h.alive && (
        <div className="hud-bc">
          {h.cooldowns.map((c) => (
            <div className="cooldown" key={c.label}>
              <div className="lbl"><span>{c.label} <Kbd>{keyLabel(bindings[c.key]?.[0])}</Kbd></span><span>{c.active ? 'Go!' : c.ready ? 'Ready' : ''}</span></div>
              <div className={`cool-track ${c.ready ? 'ready' : ''} ${c.active ? 'active' : ''}`}><div style={{ width: `${Math.max(0, Math.min(1, c.frac)) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {h.prompt && (
        <div className="prompt-card">
          <div className="prompt-key" style={{ background: h.prompt.color || '#fff' }}>{h.prompt.symbol}</div>
          <span className="chip dark">{h.prompt.label}</span>
        </div>
      )}

      {h.countdown > 0 && <div className="center-big" key={`c${h.countdown}`}>{h.countdown}</div>}
      {h.banner && h.countdown <= 0 && <div className={`center-big ${h.banner.kind}`} key={h.banner.id}>{h.banner.text}</div>}

      {h.spectating && !h.ended && h.started && (
        <div className="spectate"><span className="chip dark" style={{ fontSize: '1rem', padding: '0.4rem 0.9rem' }}>Watching {h.spectating} · <BindingKeys action="left" max={1} /> <BindingKeys action="right" max={1} /> to switch</span></div>
      )}

      <div className="feed">
        {h.feed?.map((f) => <div className="feed-item" key={f.id} style={{ borderLeftColor: f.color }}>{f.text}</div>)}
      </div>

      {showNet && h.net && (
        <div className="netstat">Ping {h.net.rtt} ms · corrections {h.net.corrections} · last error {h.net.err} m</div>
      )}
    </>
  );
}

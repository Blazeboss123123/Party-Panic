import React, { useEffect, useState } from 'react';
import { app, useStore } from '../state/store.js';
import { Button, Panel, ctx } from './components.jsx';
import { EMOTES, PHASE } from '../../shared/constants.js';
import { settings } from '../settings.js';
import { setInputEnabled } from '../game/input.js';

export function Toasts() {
  const toasts = useStore(app, (s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'warn' ? 'warn' : ''}`}>{t.text}</div>)}
    </div>
  );
}

export function ConnectionBanner() {
  const conn = useStore(app, (s) => s.connection);
  const screen = useStore(app, (s) => s.screen);
  if (conn === 'online' || screen !== 'room') return null;
  return (
    <div className="conn-banner">
      <span className="chip danger" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
        <span className="loading-dots">Connection lost. Reconnecting to your seat</span>
      </span>
    </div>
  );
}

export function PauseMenu() {
  const phase = useStore(app, (s) => s.phase);
  const room = useStore(app, (s) => s.room);
  const me = useStore(app, (s) => s.playerId);
  const [confirm, setConfirm] = useState(false);
  const isHost = room?.hostId === me;
  const inMatch = phase && phase.phase !== PHASE.LOBBY;
  const close = () => app.set({ overlay: null });
  return (
    <div className="overlay-dim interactive" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Panel className="sheet" style={{ maxWidth: '24rem' }}>
        <h2 className="display" style={{ marginBottom: '0.4rem' }}>Menu</h2>
        <p className="muted small" style={{ marginBottom: '1rem' }}>The game keeps running for everyone while this is open.</p>
        <div className="stack">
          <Button variant="lemon" block onClick={close}>Back to the game</Button>
          <Button block onClick={() => app.set({ overlay: 'settings' })}>Settings</Button>
          <Button block onClick={() => app.set({ overlay: 'howto' })}>How to play</Button>
          {isHost && inMatch && phase.phase !== PHASE.FINAL && (
            <Button block onClick={() => { ctx.session.toLobby(); close(); }}>End tournament for everyone</Button>
          )}
          {!confirm ? (
            <Button variant="danger" block onClick={() => setConfirm(true)}>Leave room</Button>
          ) : (
            <div className="stack">
              <p style={{ fontWeight: 800 }}>{inMatch ? 'Leave now? You will lose your place in this tournament.' : 'Leave this room?'}</p>
              <div className="row">
                <Button className="grow" onClick={() => setConfirm(false)}>Stay</Button>
                <Button variant="danger" className="grow" onClick={() => { close(); ctx.session.leaveRoom(); }}>Leave</Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

const EMOTE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export function EmoteWheel() {
  const close = () => app.set({ overlay: null });
  useEffect(() => {
    const onKey = (e) => {
      const i = EMOTE_KEYS.indexOf(e.code);
      if (i >= 0) { ctx.session.emote(EMOTES[i].id); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="emote-wheel interactive" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="wheel">
        {EMOTES.map((em, i) => {
          const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              type="button"
              key={em.id}
              className="btn small"
              style={{ left: `${50 + Math.cos(a) * 34}%`, top: `${50 + Math.sin(a) * 34}%` }}
              onClick={() => { ctx.session.emote(em.id); close(); }}
            >
              <span className="kbd">{i + 1}</span> {em.label}
            </button>
          );
        })}
        <div className="hub small">Pick an emote<br /><span className="muted">or press 1–6</span></div>
      </div>
    </div>
  );
}

// Keyboard shortcuts for overlays (Escape menu, emote wheel) and disabling game input
// while an overlay is open.
export function useOverlayKeys() {
  const overlay = useStore(app, (s) => s.overlay);
  const screen = useStore(app, (s) => s.screen);
  const phase = useStore(app, (s) => s.phase?.phase);
  useEffect(() => {
    setInputEnabled(!overlay);
  }, [overlay]);
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = app.get();
      if (e.code === 'Escape') {
        if (s.screen === 'room') app.set({ overlay: s.overlay ? null : 'pause' });
        else if (s.screen !== 'menu') app.set({ screen: 'menu', error: null });
        return;
      }
      const emoteKeys = settings.get().bindings.emote || [];
      const gameplay = s.phase && (s.phase.phase === PHASE.PLAYING || s.phase.phase === PHASE.INTRO || s.phase.phase === PHASE.RESOLVE);
      if (emoteKeys.includes(e.code) && s.screen === 'room' && !gameplay) {
        app.set({ overlay: s.overlay === 'emote' ? null : (s.overlay ? s.overlay : 'emote') });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, phase]);
}

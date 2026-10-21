import React, { useEffect, useRef, useState } from 'react';
import { app, useStore } from '../state/store.js';
import { settings, ACTIONS, DEFAULT_BINDINGS, keyLabel } from '../settings.js';
import { Button, Toggle, Segmented, Panel, ctx, Kbd, ControlsList, MoveKeys, BindingKeys } from './components.jsx';
import { BODY_COLORS, HATS, GLASSES, FACES } from '../../shared/cosmetics.js';
import { GAME_META, CATEGORY } from '../../shared/games/meta.js';
import { PLACEMENT_POINTS } from '../../shared/constants.js';
import { profile } from '../net/session.js';
import { usePreview } from './previews.js';

function go(screen) {
  app.set({ screen, error: null });
}

export function MainMenu() {
  const conn = useStore(app, (s) => s.connection);
  const busy = useStore(app, (s) => s.busy);
  const error = useStore(app, (s) => s.error);
  const online = conn === 'online';
  return (
    <div className="screen left interactive">
      <h1 className="logo" aria-label="Party Panic">
        {'Party'.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${i * 45}ms` }}>{ch}</span>)}
        <br />
        <span className="line2">
          {'Panic'.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${250 + i * 45}ms` }}>{ch}</span>)}
        </span>
      </h1>
      <div className="menu-stack">
        <Button variant="pink" size="big" onClick={() => go('online')}>Play online</Button>
        <Button variant="lemon" disabled={!online || !!busy} onClick={() => ctx.session.createRoom()}>Create private room</Button>
        <Button variant="lagoon" onClick={() => go('join')}>Join room</Button>
        <Button onClick={() => go('customise')}>Customise character</Button>
        <div className="menu-row">
          <Button size="small" onClick={() => go('howto')}>How to play</Button>
          <Button size="small" onClick={() => go('settings')}>Settings</Button>
        </div>
        {busy && <p className="chip lemon"><span className="loading-dots">{busy.replace('…', '')}</span></p>}
        {error && <p className="chip danger" role="alert">{error}</p>}
        {!online && <p className="chip dark"><span className="loading-dots">{conn === 'connecting' ? 'Connecting to the server' : 'Reconnecting to the server'}</span></p>}
      </div>
    </div>
  );
}

function NameField({ autoFocus }) {
  const p = useStore(settings, (s) => s.profile) || profile();
  return (
    <div className="field">
      <label htmlFor="name">Your name</label>
      <input
        id="name"
        className="input"
        maxLength={16}
        placeholder="Pick a name"
        autoFocus={autoFocus}
        value={p.name || ''}
        onChange={(e) => settings.set({ profile: { ...p, name: e.target.value } })}
      />
    </div>
  );
}

export function PlayOnline() {
  const busy = useStore(app, (s) => s.busy);
  const error = useStore(app, (s) => s.error);
  const conn = useStore(app, (s) => s.connection);
  const [code, setCode] = useState('');
  const online = conn === 'online';
  const submitJoin = (e) => {
    e.preventDefault();
    if (code.length === 4) ctx.session.joinRoom(code);
  };
  return (
    <div className="screen left interactive">
      <Panel className="sheet">
        <div className="sheet-head">
          <h2 className="display">Play online</h2>
          <Button size="small" onClick={() => go('menu')}>Back</Button>
        </div>
        <div className="stack">
          <NameField autoFocus />
          <div className="divider" />
          <h3>Host a game</h3>
          <p className="muted">Create a private room, then share its four-letter code with up to seven friends.</p>
          <Button variant="pink" disabled={!online || !!busy} onClick={() => ctx.session.createRoom()}>Create private room</Button>
          <div className="divider" />
          <h3>Join a friend</h3>
          <form className="row" onSubmit={submitJoin}>
            <input
              className="input code"
              aria-label="Room code"
              placeholder="CODE"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <Button variant="lagoon" type="submit" disabled={!online || code.length !== 4 || !!busy} onClick={submitJoin}>Join</Button>
          </form>
          {busy && <p className="chip lemon"><span className="loading-dots">{busy.replace('…', '')}</span></p>}
          {error && <p className="error" role="alert">{error}</p>}
          {!online && <p className="muted"><span className="loading-dots">Connecting to the server</span></p>}
        </div>
      </Panel>
    </div>
  );
}

export function JoinRoom() {
  const busy = useStore(app, (s) => s.busy);
  const error = useStore(app, (s) => s.error);
  const conn = useStore(app, (s) => s.connection);
  const [code, setCode] = useState('');
  const online = conn === 'online';
  const submit = (e) => {
    e.preventDefault();
    if (code.length === 4) ctx.session.joinRoom(code);
  };
  return (
    <div className="screen left interactive">
      <Panel className="sheet">
        <div className="sheet-head">
          <h2 className="display">Join room</h2>
          <Button size="small" onClick={() => go('menu')}>Back</Button>
        </div>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="code">Room code from your host</label>
            <input
              id="code"
              className="input code"
              placeholder="ABCD"
              autoFocus
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
          </div>
          <NameField />
          <Button variant="lagoon" size="big" type="submit" disabled={!online || code.length !== 4 || !!busy} onClick={submit}>Join room</Button>
          {busy && <p className="chip lemon"><span className="loading-dots">{busy.replace('…', '')}</span></p>}
          {error && <p className="error" role="alert">{error}</p>}
          {!online && <p className="muted"><span className="loading-dots">Connecting to the server</span></p>}
        </form>
      </Panel>
    </div>
  );
}

const TABS = [
  { id: 'color', label: 'Colour' },
  { id: 'hat', label: 'Hat' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'face', label: 'Face' },
];

export function Customise({ onClose, inRoom }) {
  const p = useStore(settings, (s) => s.profile) || profile();
  const [tab, setTab] = useState('color');
  const [draft, setDraft] = useState(p);
  useEffect(() => {
    // Live preview in the menu scene.
    const v = ctx.session.view;
    if (v && v.setPlayerCosmetic) v.setPlayerCosmetic(draft.cosmetic);
  }, [draft]);
  const set = (k, v) => setDraft({ ...draft, cosmetic: { ...draft.cosmetic, [k]: v } });
  const save = () => {
    ctx.session.saveProfile({ ...draft, name: (draft.name || '').slice(0, 16) });
    if (onClose) onClose();
    else go('menu');
  };
  const randomise = () => setDraft({
    ...draft,
    cosmetic: {
      color: Math.floor(Math.random() * BODY_COLORS.length),
      hat: Math.floor(Math.random() * HATS.length),
      glasses: Math.floor(Math.random() * GLASSES.length),
      face: Math.floor(Math.random() * FACES.length),
    },
  });
  const list = tab === 'hat' ? HATS : tab === 'glasses' ? GLASSES : FACES;
  return (
    <div className={`screen left interactive`}>
      <Panel className="sheet" style={{ maxWidth: '27rem' }}>
        <div className="sheet-head">
          <h2 className="display">Your look</h2>
          <Button size="small" onClick={() => (onClose ? onClose() : go('menu'))}>Cancel</Button>
        </div>
        <div className="stack">
          <div className="field">
            <label htmlFor="cname">Name</label>
            <input id="cname" className="input" maxLength={16} placeholder="Pick a name" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button type="button" role="tab" aria-selected={tab === t.id} key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
          {tab === 'color' ? (
            <div className="swatches">
              {BODY_COLORS.map((c, i) => (
                <button type="button" key={c.id} aria-label={c.name} title={c.name} className={`swatch ${draft.cosmetic.color === i ? 'on' : ''}`} style={{ background: c.hex }} onClick={() => set('color', i)} />
              ))}
            </div>
          ) : (
            <div className="optgrid">
              {list.map((o, i) => (
                <button type="button" key={o.id} className={`opt ${draft.cosmetic[tab] === i ? 'on' : ''}`} onClick={() => set(tab, i)}>{o.name}</button>
              ))}
            </div>
          )}
          <p className="muted small">Looks are just for fun. Every character has the same size, speed and jump.</p>
          <div className="row">
            <Button onClick={randomise}>Surprise me</Button>
            <Button variant="pink" className="grow" onClick={save}>{inRoom ? 'Save and show everyone' : 'Save look'}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function GameCard({ g }) {
  const img = usePreview(g.id);
  return (
    <div className="game-card">
      {img ? <img src={img} alt="" /> : <div style={{ aspectRatio: '16/9', background: 'var(--ink)', borderRadius: 12, border: '3px solid var(--ink)' }} />}
      <div>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3>{g.title}</h3>
          <span className="chip">{CATEGORY[g.category]}</span>
          {g.team && <span className="chip lagoon">Teams</span>}
        </div>
        <p className="small" style={{ marginTop: '0.25rem' }}>{g.blurb}</p>
        <div className="small" style={{ marginTop: '0.4rem' }}><ControlsList controls={g.controls} /></div>
      </div>
    </div>
  );
}

export function HowToPlay({ onClose }) {
  return (
    <div className="screen left interactive">
      <Panel className="sheet wide">
        <div className="sheet-head">
          <h2 className="display">How to play</h2>
          <Button size="small" onClick={() => (onClose ? onClose() : go('menu'))}>Back</Button>
        </div>
        <div className="scroll stack">
          <h3>Getting together</h3>
          <p>One friend creates a private room and shares the four-letter code. Everyone else chooses Join room and types it in. Up to eight players fit in a room, and you need at least two to start.</p>
          <h3>Controls</h3>
          <div className="controls-list">
            <span className="control"><MoveKeys /> or arrow keys to move</span>
            <span className="control"><BindingKeys action="jump" /> Jump</span>
            <span className="control"><BindingKeys action="sprint" max={1} /> Sprint or dash, when a minigame allows it</span>
            <span className="control"><BindingKeys action="act" /> Action: grab, shove or pass</span>
            <span className="control"><BindingKeys action="emote" /> Emotes between rounds</span>
            <span className="control"><Kbd>Esc</Kbd> Menu (the match keeps running)</span>
          </div>
          <p className="muted small">You can change every key in Settings. Each minigame shows only the keys it uses.</p>
          <h3>A tournament</h3>
          <p>The host picks five, ten or fifteen rounds. Before each round everybody votes on one of three minigames. After a short introduction and a three-second countdown you play, then see the results and the running scores.</p>
          <h3>Points per round</h3>
          <div className="points-table">
            {PLACEMENT_POINTS.map((pt, i) => <div key={i}><span>{i + 1}{['st', 'nd', 'rd'][i] || 'th'}</span>{pt}</div>)}
          </div>
          <p className="muted small">Tied players share a placement and its points. In team games, everyone on the winning team places first. The tournament winner has the most points; round wins break ties, and any remaining tie is shown as a shared place.</p>
          <h3>The fifteen minigames</h3>
          <div>{GAME_META.map((g) => <GameCard key={g.id} g={g} />)}</div>
        </div>
      </Panel>
    </div>
  );
}

function KeyBinder({ action }) {
  const bindings = useStore(settings, (s) => s.bindings);
  const [capturing, setCapturing] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { setCapturing(false); return; }
      const next = { ...settings.get().bindings };
      // A key can only belong to one action.
      for (const a of Object.keys(next)) next[a] = next[a].filter((k) => k !== e.code);
      const cur = bindings[action] || [];
      next[action] = [e.code, ...cur.filter((k) => k !== e.code)].slice(0, 2);
      settings.set({ bindings: next });
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, action, bindings]);
  const keys = bindings[action] || [];
  return (
    <button ref={ref} type="button" className={`btn small ${capturing ? 'keycap-capture' : ''}`} onClick={() => setCapturing(true)} aria-label={`Change key for ${action}`}>
      {capturing ? 'Press a key…' : keys.map((k) => keyLabel(k)).join('  /  ') || 'Unbound'}
    </button>
  );
}

export function SettingsScreen({ onClose }) {
  const s = useStore(settings);
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return (
    <div className="screen left interactive">
      <Panel className="sheet wide" style={{ maxWidth: '44rem' }}>
        <div className="sheet-head">
          <h2 className="display">Settings</h2>
          <Button size="small" onClick={() => (onClose ? onClose() : go('menu'))}>Done</Button>
        </div>
        <div className="scroll stack">
          <h3>Display</h3>
          <Toggle label="Fullscreen" value={fs} onChange={toggleFs} />
          <div className="toggle" style={{ cursor: 'default' }}>
            <span>Graphics<span className="muted small" style={{ display: 'block', fontWeight: 600 }}>Low turns off shadows and lowers resolution for slower computers.</span></span>
            <Segmented label="Graphics" value={s.graphics} onChange={(v) => settings.set({ graphics: v })} options={[{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]} />
          </div>
          <div className="toggle" style={{ cursor: 'default' }}>
            <span>Interface size</span>
            <Segmented label="Interface size" value={s.uiScale} onChange={(v) => settings.set({ uiScale: v })} options={[{ value: 0.9, label: 'S' }, { value: 1, label: 'M' }, { value: 1.15, label: 'L' }, { value: 1.3, label: 'XL' }]} />
          </div>
          <Toggle label="Reduce motion" hint="Turns off camera shake, menu sways and most screen animation." value={s.reducedMotion} onChange={(v) => settings.set({ reducedMotion: v })} />
          <Toggle label="High contrast" hint="Thicker outlines and solid panels." value={s.highContrast} onChange={(v) => settings.set({ highContrast: v })} />
          <Toggle label="Colour-accessible cues" hint="Swaps red/green warnings for orange/blue and adds symbols wherever colour carries meaning. Applies from the next round." value={s.colourAssist} onChange={(v) => settings.set({ colourAssist: v })} />
          <Toggle label="Show connection stats" value={s.showFps} onChange={(v) => settings.set({ showFps: v })} />
          <div className="divider" />
          <h3>Camera</h3>
          <div className="toggle" style={{ cursor: 'default' }}>
            <span>Camera distance</span>
            <Segmented label="Camera distance" value={s.cameraDistance} onChange={(v) => settings.set({ cameraDistance: v })} options={[{ value: 0.8, label: 'Close' }, { value: 1, label: 'Normal' }, { value: 1.2, label: 'Far' }]} />
          </div>
          <div className="toggle" style={{ cursor: 'default' }}>
            <span>Camera smoothing</span>
            <Segmented label="Camera smoothing" value={s.cameraSmoothing} onChange={(v) => settings.set({ cameraSmoothing: v })} options={[{ value: 0, label: 'Snappy' }, { value: 0.5, label: 'Balanced' }, { value: 1, label: 'Floaty' }]} />
          </div>
          <div className="toggle" style={{ cursor: 'default' }}>
            <span>Aim sensitivity<span className="muted small" style={{ display: 'block', fontWeight: 600 }}>How fast the launcher turns in Target Trouble.</span></span>
            <Segmented label="Aim sensitivity" value={s.aimSensitivity} onChange={(v) => settings.set({ aimSensitivity: v })} options={[{ value: 0.6, label: 'Low' }, { value: 1, label: 'Normal' }, { value: 1.5, label: 'High' }]} />
          </div>
          <div className="divider" />
          <div className="row">
            <h3 className="grow">Controls</h3>
            <Button size="small" onClick={() => settings.set({ bindings: DEFAULT_BINDINGS })}>Reset keys</Button>
          </div>
          {ACTIONS.map((a) => (
            <div className="toggle" key={a.id} style={{ cursor: 'default' }}>
              <span>{a.label}</span>
              <KeyBinder action={a.id} />
            </div>
          ))}
          <p className="muted small">Escape always opens the menu and cannot be remapped.</p>
        </div>
      </Panel>
    </div>
  );
}

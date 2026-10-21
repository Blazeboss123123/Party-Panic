import React, { useEffect, useState } from 'react';
import { settings, keyLabel } from '../settings.js';
import { useStore } from '../state/store.js';
import { BODY_COLORS } from '../../shared/cosmetics.js';

// Singletons wired up in main.jsx.
export const ctx = { session: null, engine: null };

export function Button({ variant = '', size = '', block, className = '', children, ...rest }) {
  const cls = ['btn', variant, size, block ? 'block' : '', className].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...rest}>{children}</button>;
}

export function Toggle({ label, value, onChange, disabled, hint }) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={value} aria-disabled={disabled} disabled={disabled} onClick={() => !disabled && onChange(!value)}>
      <span>
        {label}
        {hint && <span className="muted small" style={{ display: 'block', fontWeight: 600 }}>{hint}</span>}
      </span>
      <span className={`switch ${value ? 'on' : ''}`} />
    </button>
  );
}

export function Segmented({ options, value, onChange, disabled, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

export function BindingKeys({ action, max = 2 }) {
  const bindings = useStore(settings, (s) => s.bindings);
  const keys = (bindings[action] || []).slice(0, max);
  return (
    <>
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && <span className="muted small">or</span>}
          <Kbd>{keyLabel(k)}</Kbd>
        </React.Fragment>
      ))}
    </>
  );
}

const MOVE_KEYS = ['up', 'left', 'down', 'right'];

export function MoveKeys() {
  const bindings = useStore(settings, (s) => s.bindings);
  return (
    <>
      {MOVE_KEYS.map((a) => <Kbd key={a}>{keyLabel(bindings[a]?.[0])}</Kbd>)}
    </>
  );
}

// Renders the controls a minigame uses (from its metadata).
export function ControlsList({ controls }) {
  const items = [];
  for (const c of controls) {
    if (c === 'move') items.push(<span className="control" key="move"><MoveKeys /> Move</span>);
    else if (c === 'jump') items.push(<span className="control" key="jump"><BindingKeys action="jump" /> Jump</span>);
    else if (c === 'sprint') items.push(<span className="control" key="sprint"><BindingKeys action="sprint" max={1} /> Sprint burst</span>);
    else if (c === 'dash') items.push(<span className="control" key="dash"><BindingKeys action="sprint" max={1} /> Dash</span>);
    else if (c === 'aim') items.push(<span className="control" key="aim"><MoveKeys /> Aim</span>);
    else if (c === 'fire') items.push(<span className="control" key="fire"><BindingKeys action="jump" /> Fire</span>);
    else if (c === 'fine') items.push(<span className="control" key="fine"><BindingKeys action="sprint" max={1} /> Fine aim (hold)</span>);
    else if (c === 'prompt') items.push(<span className="control" key="prompt"><MoveKeys /> Answer arrow prompts</span>);
    else if (c && c.act) items.push(<span className="control" key="act"><BindingKeys action="act" /> {c.act}</span>);
  }
  return <div className="controls-list">{items}</div>;
}

export function Seat({ seat, color }) {
  return <span className="seat" style={{ background: color }}>{seat}</span>;
}

export function colorOf(cosmetic) {
  return BODY_COLORS[cosmetic?.color ?? 0]?.hex || '#ffffff';
}

// Remaining seconds until a server-time deadline, refreshed ~10 times per second.
export function useRemaining(until) {
  const [now, setNow] = useState(() => (ctx.session ? ctx.session.conn.serverNow() : 0));
  useEffect(() => {
    if (until == null) return undefined;
    const iv = setInterval(() => setNow(ctx.session.conn.serverNow()), 100);
    return () => clearInterval(iv);
  }, [until]);
  if (until == null) return null;
  return Math.max(0, until - now);
}

export function HazardTimer({ until, total }) {
  const left = useRemaining(until);
  if (left == null) return null;
  const frac = Math.max(0, Math.min(1, left / total));
  return (
    <div className={`hazard-bar ${left < 3.5 ? 'urgent' : ''}`} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <div style={{ width: `${frac * 100}%` }} />
    </div>
  );
}

export function Panel({ className = '', children, ...rest }) {
  return <div className={`panel ${className}`} {...rest}>{children}</div>;
}

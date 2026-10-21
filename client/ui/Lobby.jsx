import React, { useState } from 'react';
import { app, useStore, toast } from '../state/store.js';
import { Button, Toggle, Segmented, Panel, ctx, Seat, colorOf, BindingKeys } from './components.jsx';
import { EMOTES, ROUND_OPTIONS } from '../../shared/constants.js';

function statusOf(p, hostId) {
  if (!p.connected) return <span className="chip danger">Reconnecting</span>;
  if (p.spectator) return <span className="chip grape">Joins next round</span>;
  if (p.id === hostId) return <span className="chip dark">Host</span>;
  return p.ready ? <span className="chip lagoon">Ready</span> : <span className="chip">Not ready</span>;
}

export function RoomCode({ code }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast(`Copied ${code}. Send it to your friends.`);
    } catch {
      toast(`Your room code is ${code}.`);
    }
  };
  return (
    <div className="ticket">
      <div className="grow">
        <div className="label">Room code</div>
        <div className="code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</div>
      </div>
      <Button size="small" onClick={copy}>Copy code</Button>
    </div>
  );
}

export function EmoteBar() {
  return (
    <div className="emote-bar" aria-label="Emotes">
      {EMOTES.map((e) => <Button key={e.id} size="small" onClick={() => ctx.session.emote(e.id)}>{e.label}</Button>)}
    </div>
  );
}

function HostSettings({ room, isHost }) {
  const s = room.settings;
  const set = (patch) => ctx.session.setSettings(patch);
  return (
    <Panel className="tight">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <h3>Tournament</h3>
        {!isHost && <span className="muted small">Host’s choice</span>}
      </div>
      <div className="toggle" style={{ cursor: 'default' }}>
        <span>Rounds</span>
        <Segmented label="Rounds" value={s.rounds} disabled={!isHost} onChange={(v) => set({ rounds: v })} options={ROUND_OPTIONS.map((r) => ({ value: r, label: String(r) }))} />
      </div>
      <Toggle label="Team minigames" value={s.teams} disabled={!isHost} onChange={(v) => set({ teams: v })} />
      <Toggle label="Allow repeat minigames" value={s.repeats} disabled={!isHost} onChange={(v) => set({ repeats: v })} />
      <Toggle label="Late arrivals join between rounds" value={s.lateJoin} disabled={!isHost} onChange={(v) => set({ lateJoin: v })} />
      <Toggle label="Offer rematches" value={s.rematch} disabled={!isHost} onChange={(v) => set({ rematch: v })} />
    </Panel>
  );
}

export function Lobby() {
  const room = useStore(app, (s) => s.room);
  const me = useStore(app, (s) => s.playerId);
  const [busy, setBusy] = useState(false);
  if (!room) return null;
  const isHost = room.hostId === me;
  const mine = room.players.find((p) => p.id === me);
  const can = room.canStart;
  const readyCount = room.players.filter((p) => p.connected && (p.ready || p.id === room.hostId)).length;
  const connected = room.players.filter((p) => p.connected).length;
  const start = async () => {
    setBusy(true);
    await ctx.session.start();
    setBusy(false);
  };
  return (
    <div className="screen left interactive" style={{ pointerEvents: 'none' }}>
      <div className="lobby-left interactive">
        <RoomCode code={room.code} />
        <Panel className="tight">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <h3>Players</h3>
            <span className="muted small">{room.players.length} of 8</span>
          </div>
          <div className="roster">
            {room.players.map((p) => (
              <div key={p.id} className={`roster-row ${p.connected ? '' : 'off'}`}>
                <Seat seat={p.seat} color={colorOf(p.cosmetic)} />
                <span className="name">{p.name}{p.id === me ? ' (you)' : ''}</span>
                {statusOf(p, room.hostId)}
              </div>
            ))}
          </div>
          {room.players.length < 2 && <p className="muted small" style={{ marginTop: '0.5rem' }}>Share the room code. You need at least one friend to start.</p>}
        </Panel>
        <HostSettings room={room} isHost={isHost} />
      </div>
      <div className="lobby-right interactive">
        <Button size="small" onClick={() => app.set({ overlay: 'customise' })}>Customise</Button>
        <Button size="small" onClick={() => app.set({ overlay: 'howto' })}>How to play</Button>
        <Button size="small" onClick={() => app.set({ overlay: 'settings' })}>Settings</Button>
        <Button size="small" variant="danger" onClick={() => ctx.session.leaveRoom()}>Leave room</Button>
      </div>
      <div className="lobby-bottom interactive">
        <EmoteBar />
        {isHost ? (
          <>
            <Button variant="pink" size="big" disabled={!can?.ok || busy} onClick={start}>Start tournament</Button>
            <span className="hint">{can?.ok ? `Everyone is ready · ${room.settings.rounds} rounds` : can?.message}</span>
          </>
        ) : (
          <>
            <Button variant={mine?.ready ? 'lagoon' : 'lemon'} size="big" onClick={() => ctx.session.setReady(!mine?.ready)}>
              {mine?.ready ? 'Ready! Click to unready' : 'Ready up'}
            </Button>
            <span className="hint">{readyCount} of {connected} ready · waiting for the host to start</span>
          </>
        )}
        <span className="muted small" style={{ color: '#fff', textShadow: '0 1px 0 #2b1b5a' }}>
          Press <BindingKeys action="emote" max={1} /> for the emote wheel
        </span>
      </div>
    </div>
  );
}

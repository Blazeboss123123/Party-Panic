import React, { useEffect, useMemo, useState } from 'react';
import { app, useStore } from '../state/store.js';
import { Button, Panel, ctx, HazardTimer, ControlsList, Seat, colorOf, useRemaining } from './components.jsx';
import { META_BY_ID, CATEGORY } from '../../shared/games/meta.js';
import { PHASE_TIME } from '../../shared/constants.js';
import { TEAMS } from '../../shared/cosmetics.js';
import { usePreview } from './previews.js';
import { EmoteBar } from './Lobby.jsx';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function useRoomPlayers() {
  const room = useStore(app, (s) => s.room);
  return useMemo(() => new Map((room?.players || []).map((p) => [p.id, p])), [room]);
}

function BigTitle({ children, sub }) {
  return (
    <div className="vote-title">
      <div className="display">{children}</div>
      {sub && <p style={{ fontWeight: 800, marginTop: '0.4rem', textShadow: '0 2px 0 #2b1b5a' }}>{sub}</p>}
    </div>
  );
}

export function Prematch({ phase }) {
  const left = useRemaining(phase.until);
  return (
    <div className="vote-wrap">
      <BigTitle sub={`${phase.total} rounds · highest total score wins`}>Tournament starting</BigTitle>
      <div className="center-big" key={Math.ceil(left || 0)} style={{ position: 'static', transform: 'none', animation: 'none' }}>{Math.max(1, Math.ceil(left || 0))}</div>
    </div>
  );
}

function VoteCard({ id, counts, mine, onVote, disabled, state, players, voters }) {
  const g = META_BY_ID[id];
  const img = usePreview(id);
  const n = counts[id] || 0;
  return (
    <button
      type="button"
      className={`vote-card ${mine ? 'mine' : ''} ${state || ''}`}
      disabled={disabled}
      onClick={() => onVote(id)}
      aria-pressed={mine}
    >
      <div className="vote-preview">
        {img && <img src={img} alt="" />}
        <span className="chip lemon">{CATEGORY[g.category]}</span>
      </div>
      <div className="vote-body">
        <div className="display">{g.title}</div>
        <p className="small">{g.objective}</p>
        <div className="row small" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
          {g.team ? <span className="chip lagoon">Two teams</span> : <span className="chip">Free for all</span>}
          <span className="chip">About {g.duration < 60 ? `${g.duration}s` : `${Math.round(g.duration / 60 * 2) / 2} min`}</span>
        </div>
        <div className="vote-dots" aria-label={`${n} votes`}>
          {voters.map((pid) => <span key={pid} className="vote-dot" style={{ background: colorOf(players.get(pid)?.cosmetic) }} />)}
        </div>
      </div>
    </button>
  );
}

export function Voting({ phase }) {
  const me = useStore(app, (s) => s.playerId);
  const room = useStore(app, (s) => s.room);
  const players = useRoomPlayers();
  const { options, counts, voted } = phase.data;
  const [myVote, setMyVote] = useState(null);
  useEffect(() => { setMyVote(null); }, [phase.round]);
  const hasVoted = voted?.includes(me) || !!myVote;
  const meP = players.get(me);
  const spectator = meP?.spectator;
  const vote = async (id) => {
    if (hasVoted || spectator) return;
    setMyVote(id);
    const r = await ctx.session.vote(id);
    if (!r.ok) setMyVote(null);
  };
  const votersFor = (id) => {
    const list = Object.entries(phase.data.votes || {}).filter(([, g]) => g === id).map(([pid]) => pid);
    if (myVote === id && !list.includes(me)) list.unshift(me);
    return list;
  };
  const eligible = room.players.filter((p) => p.connected && !p.spectator).length;
  return (
    <div className="vote-wrap interactive">
      <BigTitle sub={`Round ${phase.round} of ${phase.total} · ${voted?.length || 0} of ${eligible} voted`}>
        {spectator ? 'Players are voting' : hasVoted ? 'Vote locked in' : 'Vote for the next minigame'}
      </BigTitle>
      <div style={{ width: 'min(60rem, 90vw)' }}><HazardTimer until={phase.until} total={PHASE_TIME.voting} /></div>
      <div className="vote-cards">
        {options.map((id) => (
          <VoteCard key={id} id={id} counts={counts} mine={myVote === id} onVote={vote} disabled={hasVoted || spectator} players={players} voters={votersFor(id)} />
        ))}
      </div>
      {spectator && <p className="chip grape">You will join from the next round.</p>}
      <EmoteBar />
    </div>
  );
}

export function Reveal({ phase }) {
  const players = useRoomPlayers();
  const { options, counts, chosen, tied } = phase.data;
  return (
    <div className="vote-wrap">
      <BigTitle sub={tied ? 'It was a tie, so the server picked at random between the tied games.' : 'Most votes wins.'}>
        {META_BY_ID[chosen].title}
      </BigTitle>
      <div className="vote-cards">
        {options.map((id) => (
          <VoteCard key={id} id={id} counts={counts} mine={false} onVote={() => {}} disabled state={id === chosen ? 'chosen' : 'lost'} players={players} voters={Object.entries(phase.data.votes || {}).filter(([, g]) => g === id).map(([pid]) => pid)} />
        ))}
      </div>
    </div>
  );
}

export function Intro({ phase }) {
  const g = META_BY_ID[phase.data.gameId];
  const me = useStore(app, (s) => s.playerId);
  const loading = useStore(app, (s) => s.loadingRound);
  const start = phase.data.start;
  const inRound = start?.roster.some((r) => r.pid === me);
  const myTeam = start?.roster.find((r) => r.pid === me)?.team;
  return (
    <div className="intro">
      <Panel>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="chip lemon">Round {phase.round} of {phase.total}</span>
          <span className="chip">{CATEGORY[g.category]}</span>
        </div>
        <div className="title">{g.title}</div>
        <p style={{ fontWeight: 800 }}>{g.objective}</p>
        <ul>{g.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        {g.team && myTeam >= 0 && (
          <p className="chip" style={{ marginTop: '0.7rem', background: TEAMS[myTeam].hex }}>You are on {TEAMS[myTeam].name}</p>
        )}
        <div className="divider" style={{ margin: '0.9rem 0 0.7rem' }} />
        <ControlsList controls={g.controls} />
        <p className="muted small" style={{ marginTop: '0.8rem' }}>
          {!inRound ? 'You are watching this round.' : loading ? 'Building the arena…' : 'Waiting for everyone to load…'}
        </p>
      </Panel>
    </div>
  );
}

function ResultRows({ results, me, players }) {
  return (
    <div>
      {results.rows.map((r) => (
        <div className="result-row" key={r.pid} style={r.pid === me ? { background: 'rgba(255,210,63,0.35)', borderRadius: 10 } : null}>
          <span className={`place p${r.place}`}>{r.place}</span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: '0.45rem' }}>
              <Seat seat={r.seat} color={colorOf(r.cosmetic)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}{r.pid === me ? ' (you)' : ''}</span>
              {r.team >= 0 && <span className="chip" style={{ background: TEAMS[r.team].hex }}>{TEAMS[r.team].short}</span>}
            </div>
            {r.stat && <div className="stat">{r.stat}</div>}
          </div>
          <span className="pts">+{r.points}</span>
          <span className="tot">{r.total}</span>
        </div>
      ))}
    </div>
  );
}

export function Results({ phase }) {
  const me = useStore(app, (s) => s.playerId);
  const players = useRoomPlayers();
  const res = phase.data.results;
  if (!res) return null;
  const g = META_BY_ID[res.gameId];
  const winners = res.rows.filter((r) => r.place === 1);
  const headline = res.teamResult
    ? res.teamResult.draw ? 'A draw! Both teams share first place.' : `${TEAMS[res.teamResult.winner].name} wins!`
    : winners.length > 1 ? `${winners.map((w) => w.name).join(' and ')} tie for first!` : `${winners[0]?.name} wins the round!`;
  return (
    <div className="results">
      <Panel>
        <div className="row" style={{ gap: '0.5rem', marginBottom: '0.3rem' }}>
          <span className="chip lemon">Round {res.round} of {res.total}</span>
          <span className="chip">{g.title}</span>
        </div>
        <h2 className="display" style={{ fontSize: '2rem', margin: '0.3rem 0 0.6rem' }}>{headline}</h2>
        <div className="row small muted" style={{ justifyContent: 'flex-end', gap: '1.2rem', paddingRight: '0.3rem' }}>
          <span>Round</span><span>Total</span>
        </div>
        <ResultRows results={res} me={me} players={players} />
        {phase.phase === 'results' && <div style={{ marginTop: '0.8rem' }}><HazardTimer until={phase.until} total={PHASE_TIME.results} /></div>}
      </Panel>
    </div>
  );
}

function StandingsTable({ standings, me, games, showRounds = true }) {
  return (
    <table className="standings-table">
      <thead>
        <tr><th>#</th><th>Player</th><th>Points</th><th>Wins</th>{showRounds && <th>Round by round</th>}</tr>
      </thead>
      <tbody>
        {standings.map((s) => (
          <tr key={s.id} style={s.id === me ? { background: 'rgba(255,210,63,0.35)' } : null}>
            <td><span className={`place p${s.place}`} style={{ width: '2rem', height: '2rem', fontSize: '0.95rem' }}>{s.place}</span></td>
            <td>
              <div className="row" style={{ gap: '0.45rem' }}>
                <Seat seat={s.seat} color={colorOf(s.cosmetic)} />
                <span>{s.name}{s.id === me ? ' (you)' : ''}{s.left ? <span className="muted small"> · left</span> : null}</span>
              </div>
            </td>
            <td style={{ fontFamily: 'var(--display)', fontSize: '1.2rem' }}>{s.total}</td>
            <td>{s.wins}</td>
            {showRounds && (
              <td>
                <div className="round-chips">
                  {s.history.map((h, i) => (
                    <span key={i} className={`round-chip ${h ? (h.place === 1 ? 'w' : '') : 'x'}`} title={h ? `Round ${i + 1}: ${ordinal(h.place)} in ${META_BY_ID[h.gameId]?.title}, +${h.points}` : `Round ${i + 1}: did not play`}>
                      {h ? h.place : '–'}
                    </span>
                  ))}
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Intermission({ phase }) {
  const me = useStore(app, (s) => s.playerId);
  return (
    <div className="results">
      <Panel>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="chip lemon">Standings after round {phase.round}</span>
        </div>
        <h2 className="display" style={{ fontSize: '2rem', margin: '0.4rem 0 0.6rem' }}>Up next: round {phase.data.nextRound} of {phase.total}</h2>
        <StandingsTable standings={phase.data.standings} me={me} showRounds />
        <div style={{ marginTop: '0.8rem' }}><HazardTimer until={phase.until} total={PHASE_TIME.intermission} /></div>
      </Panel>
      <div style={{ marginTop: '1rem', alignSelf: 'center' }} className="interactive"><EmoteBar /></div>
    </div>
  );
}

export function Final({ phase }) {
  const me = useStore(app, (s) => s.playerId);
  const room = useStore(app, (s) => s.room);
  const isHost = room?.hostId === me;
  const { standings, tiedForFirst } = phase.data;
  const top = standings.filter((s) => s.place === 1);
  return (
    <div className="final interactive">
      <Panel>
        <span className="chip lemon">Tournament complete · {phase.total} rounds</span>
        <h2 className="display" style={{ fontSize: '2.4rem', margin: '0.5rem 0 0.2rem' }}>
          {tiedForFirst ? `${top.map((t) => t.name).join(' and ')} share the crown!` : `${top[0]?.name} wins Party Panic!`}
        </h2>
        <p className="muted small" style={{ marginBottom: '0.7rem' }}>
          {tiedForFirst ? 'Tied on points and on round wins, so first place is shared.' : 'Most total points. Round wins would have broken a tie.'}
        </p>
        <div className="scroll" style={{ maxHeight: '50vh' }}>
          <StandingsTable standings={standings} me={me} games={phase.data.games} />
        </div>
        <div className="final-actions">
          {isHost ? (
            <>
              {room.settings.rematch && <Button variant="pink" size="big" onClick={() => ctx.session.rematch()}>Rematch</Button>}
              <Button variant="lemon" onClick={() => ctx.session.toLobby()}>Return to lobby</Button>
            </>
          ) : (
            <span className="chip dark">Waiting for the host to choose a rematch or the lobby</span>
          )}
          <Button variant="danger" size="small" onClick={() => ctx.session.leaveRoom()}>Leave room</Button>
        </div>
      </Panel>
      <div style={{ marginTop: '1rem', alignSelf: 'center' }}><EmoteBar /></div>
    </div>
  );
}

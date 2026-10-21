import React, { useEffect } from 'react';
import { app, useStore } from '../state/store.js';
import { settings } from '../settings.js';
import { PHASE } from '../../shared/constants.js';
import { MainMenu, PlayOnline, JoinRoom, Customise, HowToPlay, SettingsScreen } from './MenuScreens.jsx';
import { Lobby } from './Lobby.jsx';
import { Prematch, Voting, Reveal, Intro, Results, Intermission, Final } from './Phases.jsx';
import { Hud } from './Hud.jsx';
import { Toasts, ConnectionBanner, PauseMenu, EmoteWheel, useOverlayKeys } from './Overlays.jsx';

function RoomScreens() {
  const phase = useStore(app, (s) => s.phase);
  const p = phase?.phase || PHASE.LOBBY;
  switch (p) {
    case PHASE.LOBBY: return <Lobby />;
    case PHASE.PREMATCH: return <Prematch phase={phase} />;
    case PHASE.VOTING: return <Voting phase={phase} />;
    case PHASE.REVEAL: return <Reveal phase={phase} />;
    case PHASE.INTRO: return <Intro phase={phase} />;
    case PHASE.PLAYING: return null;
    case PHASE.RESOLVE: return null;
    case PHASE.RESULTS: return <Results phase={phase} />;
    case PHASE.INTERMISSION: return <Intermission phase={phase} />;
    case PHASE.FINAL: return <Final phase={phase} />;
    default: return null;
  }
}

function GameHud() {
  const p = useStore(app, (s) => s.phase?.phase);
  return p === PHASE.PLAYING || p === PHASE.RESOLVE ? <Hud /> : null;
}

export function App() {
  const screen = useStore(app, (s) => s.screen);
  const overlay = useStore(app, (s) => s.overlay);
  const s = useStore(settings);
  useOverlayKeys();
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale || 1));
    document.body.classList.toggle('hc', !!s.highContrast);
    document.body.classList.toggle('rm', !!s.reducedMotion);
    document.body.classList.toggle('ca', !!s.colourAssist);
  }, [s.uiScale, s.highContrast, s.reducedMotion, s.colourAssist]);
  const close = () => app.set({ overlay: null });
  return (
    <>
      {screen === 'menu' && <MainMenu />}
      {screen === 'online' && <PlayOnline />}
      {screen === 'join' && <JoinRoom />}
      {screen === 'customise' && <Customise />}
      {screen === 'howto' && <HowToPlay />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'room' && (
        <>
          <GameHud />
          <RoomScreens />
        </>
      )}
      {overlay === 'pause' && <PauseMenu />}
      {overlay === 'emote' && <EmoteWheel />}
      {overlay === 'settings' && <div className="overlay-dim interactive"><SettingsScreen onClose={close} /></div>}
      {overlay === 'howto' && <div className="overlay-dim interactive"><HowToPlay onClose={close} /></div>}
      {overlay === 'customise' && <div className="overlay-dim interactive" style={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}><Customise inRoom onClose={close} /></div>}
      <Toasts />
      <ConnectionBanner />
    </>
  );
}

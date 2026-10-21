import React from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { App } from './ui/App.jsx';
import { Engine } from './game/engine.js';
import { Session } from './net/session.js';
import { initInput } from './game/input.js';
import { ctx } from './ui/components.jsx';
import { app } from './state/store.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot() {
  const root = document.getElementById('ui');
  if (!webglAvailable()) {
    root.innerHTML = '<div class="screen center"><div class="panel sheet"><h2 class="display">3D graphics are unavailable</h2><p>Party Panic needs WebGL. Turn on hardware acceleration in your browser settings or try another browser.</p></div></div>';
    return;
  }
  // Wait briefly for fonts so canvas-drawn name tags use them.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 40px "Bagel Fat One"'), document.fonts.load('700 40px Gabarito')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fonts are optional */ }
  initInput();
  const engine = new Engine(document.getElementById('scene'));
  const session = new Session(engine);
  ctx.engine = engine;
  ctx.session = session;
  window.__pp = { engine, session, app }; // handy for debugging and automated tests
  createRoot(root).render(<App />);
  document.getElementById('boot')?.remove();
}

boot();

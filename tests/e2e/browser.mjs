// End-to-end test with two separate Chromium processes playing through the real UI over
// real WebSockets: create a room, join by code, ready up, start, vote, load, play a round
// with the keyboard, and see the results. It also checks that each browser renders the
// *other* player where the server says they are (true remote state, not a local fake).
//
// Needs Playwright and a Chromium build:
//   npm i -D playwright && npx playwright install chromium
//   npm run build && npm run test:browser
// Optional env: PW_CHROMIUM=/path/to/chrome  E2E_SHOTS=dir  E2E_GAME=grab-everything
process.env.PP_FAST = '1';
// Headless software rendering is slow, so keep phases long enough to click through.
process.env.PP_PHASE_SCALE = process.env.PP_PHASE_SCALE || '0.6';
process.env.PP_LOG = process.env.PP_LOG || 'silent';
// Grab Everything: a walled arena, so walking around never ends the round early.
process.env.PP_FORCE_GAMES = process.env.E2E_GAME || 'grab-everything';
process.env.PP_DURATION_SCALE = process.env.PP_DURATION_SCALE || '0.45';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.log('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const { createServer } = await import('../../server/index.js');
const srv = await createServer({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${srv.port}/`;
const shots = process.env.E2E_SHOTS || path.join('tests', 'e2e', 'shots');
fs.mkdirSync(shots, { recursive: true });

const launch = () => chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
const browsers = [await launch(), await launch()];

async function open(browser, tag) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  // Software rendering is slow: use the low graphics preset to keep the frame rate usable.
  await context.addInitScript(() => {
    try { if (!localStorage.getItem('pp-settings')) localStorage.setItem('pp-settings', JSON.stringify({ graphics: 'low' })); } catch { /* ignore */ }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  await page.goto(base);
  await page.waitForFunction(() => window.__pp && document.querySelector('.menu, .main-menu, button'), null, { timeout: 30000 });
  return page;
}

const step = (name) => console.log(`- ${name}`);
const phaseOf = (page) => page.evaluate(() => window.__pp.app.get().phase?.phase || null);
const waitPhase = (page, ph, timeout = 30000) => page.waitForFunction((p) => window.__pp.app.get().phase?.phase === p, ph, { timeout });

try {
  const A = await open(browsers[0], 'A');
  const B = await open(browsers[1], 'B');
  await A.waitForTimeout(1500);

  step('A creates a private room');
  await A.getByText('Play online', { exact: true }).click();
  await A.locator('#name').fill('Alex');
  await A.getByText('Create private room', { exact: true }).last().click();
  await A.waitForSelector('.ticket .code', { timeout: 15000 });
  const code = (await A.locator('.ticket .code').textContent()).trim();
  assert.match(code, /^[A-Z]{4}$/, 'room code shown');

  step(`B joins room ${code} by code`);
  await B.getByText('Join room', { exact: true }).click();
  await B.locator('#code').fill(code.toLowerCase());
  await B.locator('#name').fill('Bea');
  await B.getByRole('button', { name: 'Join room' }).click();
  await A.waitForFunction(() => window.__pp.app.get().room?.players.length === 2, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__pp.app.get().room?.players.length === 2, null, { timeout: 15000 });
  await A.screenshot({ path: `${shots}/1-lobby.png` });

  step('B readies up, A starts');
  await B.getByText('Ready up', { exact: true }).click();
  await A.waitForFunction(() => window.__pp.app.get().room?.canStart?.ok, null, { timeout: 10000 });
  await A.getByText('Start tournament', { exact: true }).click();

  step('Both vote');
  await A.waitForSelector('.vote-card', { timeout: 20000 });
  await B.waitForSelector('.vote-card', { timeout: 20000 });
  await A.locator('.vote-card').first().click();
  await B.locator('.vote-card').first().click();
  await A.waitForTimeout(600);
  await A.screenshot({ path: `${shots}/2-voting.png` });

  step('Intro and synced countdown');
  await waitPhase(A, 'intro', 20000);
  await A.screenshot({ path: `${shots}/3-intro.png` });
  await waitPhase(A, 'playing', 40000);
  await waitPhase(B, 'playing', 5000);
  await A.waitForFunction(() => document.querySelector('.timer-pill'), null, { timeout: 10000 });
  // Wait for the countdown to finish (controls unlock).
  await A.waitForTimeout(3600);

  step('A moves with the keyboard; server and B agree on where A is');
  const room = srv.manager.get(code);
  const R = room.tournament.R;
  assert.ok(R, 'server round running');
  const aPid = await A.evaluate(() => window.__pp.app.get().playerId);
  const a0 = { ...R.byPid.get(aPid).ch };
  // Short probe with W, then keep walking whichever way (W or S) heads toward the middle so
  // A does not walk off the arena.
  console.log(`  render rate while playing: A ${(await A.evaluate(() => window.__pp.engine.fps)).toFixed(1)} fps, B ${(await B.evaluate(() => window.__pp.engine.fps)).toFixed(1)} fps`);
  await A.keyboard.down('KeyW');
  await A.waitForTimeout(900);
  await A.keyboard.up('KeyW');
  await A.waitForTimeout(700);
  const a1 = { ...R.byPid.get(aPid).ch };
  const probe = Math.hypot(a1.x - a0.x, a1.z - a0.z);
  assert.ok(probe > 0.3, `server moved A from keyboard input (probe ${probe.toFixed(2)}m)`);
  const outward = (a1.x - a0.x) * a1.x + (a1.z - a0.z) * a1.z > 0;
  const key = outward ? 'KeyS' : 'KeyW';
  await A.keyboard.down(key);
  await A.waitForTimeout(900);
  await A.keyboard.up(key);
  await A.keyboard.press('Space');
  await A.waitForTimeout(1200);
  const aSrv = R.byPid.get(aPid).ch;
  const moved = Math.hypot(aSrv.x - a1.x, aSrv.z - a1.z);
  assert.ok(moved > 1, `server moved A again (${moved.toFixed(2)}m with ${key})`);
  assert.ok(R.byPid.get(aPid).alive, 'A is still in the round');
  const seenByB = await B.evaluate((pid) => {
    const v = window.__pp.engine.view;
    const slot = v.roster.findIndex((r) => r.pid === pid);
    const c = v.chars[slot];
    return { x: c.pos.x, y: c.pos.y, z: c.pos.z };
  }, aPid);
  const gap = Math.hypot(seenByB.x - aSrv.x, seenByB.z - aSrv.z);
  // Remote players are drawn ~100 ms in the past; headless rendering is slow, so allow slack.
  assert.ok(gap < 2.5, `B renders A near the server position (gap ${gap.toFixed(2)}m)`);
  await A.screenshot({ path: `${shots}/4-play-a.png` });
  await B.screenshot({ path: `${shots}/5-play-b.png` });

  step('Escape opens the local menu without pausing the match');
  const tBefore = R.t;
  await B.keyboard.press('Escape');
  await B.waitForTimeout(800);
  await B.screenshot({ path: `${shots}/6-pause-b.png` });
  assert.ok(R.t > tBefore + 0.5 || R.ended, 'server round keeps running');
  await B.keyboard.press('Escape');

  step('B runs around too; the round resolves with server-assigned placements');
  await B.keyboard.down('KeyD');
  await B.keyboard.down('ShiftLeft');
  await B.waitForTimeout(2500);
  await B.keyboard.up('KeyD');
  await B.keyboard.up('ShiftLeft');
  await waitPhase(A, 'results', 150000);
  await waitPhase(B, 'results', 10000);
  const grab = () => window.__pp.app.get().phase?.data?.results;
  const resA = await A.evaluate(grab);
  const resB = await B.evaluate(grab);
  assert.ok(resA && resB, 'both browsers received round results');
  assert.deepEqual(resA.rows.map((r) => [r.pid, r.place, r.points]), room.tournament.lastResults.rows.map((r) => [r.pid, r.place, r.points]), 'browser shows the server-assigned results');
  await A.screenshot({ path: `${shots}/7-results.png` });
  assert.deepEqual(resA.rows.map((r) => [r.pid, r.place, r.points]), resB.rows.map((r) => [r.pid, r.place, r.points]), 'both browsers show the same results');
  const fps = await A.evaluate(() => window.__pp.engine.fps);
  console.log(`  results: ${resA.rows.map((r) => `${r.name} #${r.place} +${r.points}`).join(', ')}`);
  console.log(`  headless render rate: ${fps.toFixed(1)} fps (software GPU; not representative)`);

  step('Reload keeps the same identity (reconnect)');
  const before = (await B.evaluate(() => window.__pp.app.get().playerId));
  await B.reload();
  await B.waitForFunction(() => window.__pp?.app.get().playerId, null, { timeout: 20000 });
  const after = await B.evaluate(() => window.__pp.app.get().playerId);
  assert.equal(after, before, 'same player after reload');
  assert.equal(room.players.size, 2, 'no duplicate player after reload');

  const real = errors.filter((e) => !/WebGL|GPU stall|swiftshader|Automatic fallback/i.test(e));
  assert.deepEqual(real, [], 'no page errors');
  console.log(`\nBrowser end-to-end test passed. Screenshots in ${shots}/`);
  void phaseOf;
} catch (err) {
  console.error('FAILED', err);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  for (const b of browsers) await b.close();
  await srv.close();
}

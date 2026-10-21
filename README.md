# Party Panic

A 3D online party game for 2 to 8 players in the browser. Friends join a private room with
a four-letter code, vote on minigames, and play a tournament of 5, 10 or 15 rounds across
fifteen 3D minigames. The server runs every match and keeps the score; browsers only send
key presses and draw what the server says is happening.

There is no audio of any kind, by design.

## Quick start

You need [Node.js](https://nodejs.org) 18.17 or newer (developed and tested on Node 22).

```bash
npm install
npm run build      # bundles the browser client into public/assets
npm start          # http://localhost:3000
```

Open `http://localhost:3000`, choose **Play online → Create private room**, and share the
code. Other people on your network can join at `http://<your-computer's-IP>:3000`. To play
with friends elsewhere, deploy it (see [Deploying](#deploying)).

A prebuilt client is already in `public/assets`, so `npm start` works even before
`npm run build`. Rebuild after changing anything in `client/` or `shared/`.

## How a tournament works

1. **Room** — the host creates a room and gets a code (with a Copy code button). Up to
   eight players join, pick a name, colour, hat, glasses and face (cosmetics never affect
   gameplay), and press Ready.
2. **Host settings** — 5, 10 or 15 rounds; team games on or off; repeats on or off; late
   join on or off; rematch on or off. The host starts once everyone else is ready
   (minimum two players).
3. **Each round** — three minigames are offered and everyone gets one vote (13 seconds;
   ties are broken at random; players who don't vote never hold things up). The winner's
   intro shows the goal, rules and controls while every browser loads it, then a shared
   3-2-1 countdown starts the round.
4. **Points** — placements earn 10, 8, 7, 6, 5, 4, 3, 2 points. Players who tie share
   the place and the points (1st, 1st, 3rd…). In the team game, everyone on the
   winning team places first. Scores are calculated on the server, exactly once per round.
5. **Final results** — a podium, total points, round wins and every round's placement.
   Ties on points are broken by round wins; if those are equal too, the players share the
   place. Then rematch (scores reset) or go back to the lobby.

With repeats off, a game is not offered again until every eligible game has been played;
when fewer than three unplayed games remain, the least recently played ones fill the
remaining slots so voting always has three options.

**Joining, leaving and reconnecting.** A ninth player is turned away with a clear
message. If the host leaves, the next player becomes host. A player who disconnects keeps
their seat and score for 60 seconds and comes back as the same player on reload — no
duplicate. Mid-round they forfeit that round after 10 seconds away so nobody is held up.
With late join on, newcomers join between rounds and play from the next one. If fewer than
two players remain connected, the tournament ends and everyone returns to the lobby.

## Controls

| Action | Default keys |
| --- | --- |
| Move | W A S D or arrow keys |
| Jump / primary action | Space |
| Sprint / dash (game dependent) | Shift |
| Interact (grab, pass, pull) | E |
| Emote wheel | T |
| Menu (the match keeps running) | Escape |

All keys can be remapped in **Settings → Controls**. Each minigame's intro and HUD list
only the controls that game uses.

## The minigames

| Minigame | Type | Goal |
| --- | --- | --- |
| The Floor Is Gone | Survival | Tiles crumble after you step on them; two layers of floor over a drop. Last one standing wins. |
| Dash for Cash | Race | Obstacle course with swinging arms and pendulums. First across the line wins; coins break ties. |
| Boulder Panic | Survival | Dodge waves of rolling boulders; lanes glow before each one rolls. Three hearts each, and falling off the edge is out. |
| Grab Everything | Collect | Gems worth 1, 3 and 5 on the ground and high platforms; speed pickups. Highest score wins. |
| Colour Rush | Reaction | Each stage calls a colour and its symbol; stand on a matching pad before every other pad drops. The ring speeds up and turns. |
| Personal Space | Physics | Shove rivals with E off a platform whose outer rings break away; a sweeping bar joins in later. |
| Don't Drop It | Race | Carry a wobbly cake past bumpers and sweepers to your pad without dropping it. |
| Memory Mayhem | Memory | Watch a sequence of symbol pads light up, then jump on them in order. Sequences grow. |
| Wobble Works | Survival | Platforms lean under players' weight, tilt harder over time and collapse; a sweeper spins over the middle. |
| Conveyor Chaos | Race | A factory of conveyor belts, pistons, crushers and sweepers. |
| Target Trouble | Aim | Keyboard-aimed paint launchers; ring, bullseye, balloon and rare gold star targets (1/2/3/10). Shots are real projectiles with server-side hit detection. |
| The Last Platform | Survival | Platforms shuffle, disappear and rise again; ghosts preview where each will be. Choose fast. |
| Bomb Relay | Reaction | The server hands out fused bombs; pass them with E. Holding one when it blows knocks you out. |
| Treasure Tug | Team | Two balanced teams pull a chest along a rail with arrow prompts; uneven teams get scaled pull strength. |
| Shadow Sprint | Race | A dark neon course of laser gates, sweeping beams, a rotor and a laser floor. |

## Settings and accessibility

Fullscreen, graphics quality (low turns off shadows and lowers resolution), interface
size (S to XL), camera distance and smoothing, aim sensitivity, key remapping, reduce
motion (no camera shake or menu sway), high contrast (thicker outlines, solid panels),
and **colour-accessible cues**: red/green warnings switch to an orange/blue pair and games
add symbols wherever colour carries meaning (crosses on doomed platforms, values on gems,
ticks and crosses in Memory Mayhem, dashed rings for the second team). Colour Rush always
pairs every colour with a symbol, and every player has a seat number next to their colour.
Settings are saved per browser.

## Development

```bash
npm run dev        # rebuilds the client on save and restarts the server on change
```

**Minigame sandbox.** `http://localhost:3000/sandbox.html?game=<id>&n=4` runs one
minigame entirely in the page against test bots (no server round needed). It is how the
minigames were tuned. Game ids: `floor-gone`, `dash-cash`, `boulder-panic`,
`grab-everything`, `colour-rush`, `personal-space`, `dont-drop-it`, `memory-mayhem`,
`wobble-works`, `conveyor-chaos`, `target-trouble`, `last-platform`, `bomb-relay`,
`treasure-tug`, `shadow-sprint`.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (hosts usually set this). |
| `HOST` | `0.0.0.0` | Interface to listen on. |
| `PP_RECONNECT_GRACE` | `60` | Seconds a disconnected player keeps their seat. |
| `PP_EMPTY_ROOM_TTL` | `120` | Seconds an empty room is kept. |
| `PP_MAX_ROOMS` | `500` | Maximum simultaneous rooms. |
| `PP_LOG` | `info` | `silent` turns logging off. |
| `PP_FAST` | off | Testing: short phases and countdown. |
| `PP_PHASE_SCALE` | `1` | Testing: multiplies the between-round phase lengths. |
| `PP_DURATION_SCALE` | `1` | Testing: multiplies minigame time limits. |
| `PP_FORCE_GAMES` | — | Testing: comma-separated game ids always offered first. |

`.env.example` lists the same values.

## Deploying

The server is a single Node process that serves the page and the WebSocket endpoint
(`/ws`) on the same port, so any Node host that supports WebSockets works.

**Render (free tier)**

1. Push this folder to a GitHub repository.
2. In Render choose **New → Blueprint** and pick the repository; `render.yaml` sets
   everything up. Or create a **Web Service** by hand:
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/health`
3. Open the `onrender.com` address and share room codes with friends.

Things to know about the free tier: the service sleeps after about 15 minutes without
visitors, so the first load can take up to a minute; rooms live in memory, so a restart
or redeploy closes them (players see a message telling them to create a new room). Run
exactly one instance — rooms are not shared between instances.

**Other hosts.** Any host that runs `npm start` works (Railway, Fly.io, a VPS). Behind
your own reverse proxy, forward WebSocket upgrades on `/ws`. `GET /health` returns room
count and server tick cost.

## Architecture

```
client/     React UI + three.js rendering, prediction and interpolation
  game/       renderer, input, prediction, round view, materials, effects
  minigames/  visuals and HUD for each of the 15 minigames
  scenes/     menu island, lobby stage, podium
  ui/         screens, lobby, voting, results, HUD, overlays, styles
  net/        WebSocket connection with acks and clock sync; session state
shared/     code used by both server and client
  physics.js, controller.js   deterministic collision and character movement
  games/      each minigame's arena layout and moving-obstacle maths
server/
  net/hub.js           WebSocket protocol, validation and rate limits
  rooms/               rooms, seats, host migration, reconnection
  match/tournament.js  the tournament state machine (voting → intro → play → results …)
  match/round.js       one authoritative minigame round at 60 Hz
  games/               each minigame's rules, end conditions and ranking
  scoring/             placements, points, final standings
tests/      unit, network, every-minigame, tournament, browser and load tests
```

- **Server authority.** The server simulates every round at a fixed 60 Hz, checks and
  clamps every input, and decides all hits, eliminations, finishes, placements and
  points. Clients cannot assign scores.
- **Netcode.** Clients send inputs at 60 Hz on a real-time clock (so a slow frame rate
  does not slow a player down) and receive snapshots at 30 Hz. Your own character is
  predicted and reconciled against the server with input replay and smoothed
  corrections; other players are interpolated about 100 ms behind. Moving obstacles are
  pure functions of time, so both sides compute exactly the same positions.
- **Determinism.** Arena layouts come from a seeded RNG chosen by the server.

### Stack choices

The brief preferred React + three.js + React Three Fiber + Drei + Rapier + Socket.IO. The
environment this was built in could not reach the npm registry, so packages that could not
be obtained another way were replaced:

| Preferred | Used | Why it is fine |
| --- | --- | --- |
| React | React 19 | Same. |
| three.js | three.js r186 | Same. |
| React Three Fiber + Drei | three.js driven directly from the React app | Same 3D renderer; scenes are plain classes. |
| Rapier | A small deterministic physics and character controller in `shared/` | Runs identically on server and client, which prediction needs. |
| Socket.IO | `ws` with a small event and acknowledgement layer | Same model (named events, request/acknowledge, reconnection). |

## Testing

| Command | What it checks |
| --- | --- |
| `npm test` | 24 unit tests (physics, collision, scoring, ties, voting, tiebreaks) and 8 network tests over real sockets: create/join, invalid, malformed and unknown codes, 8 fit and the 9th is rejected, ready and host-only permissions, host migration, reconnecting without duplicates, a second tab replacing the first, grace expiry, malformed messages. |
| `npm run test:games` | Every minigame at 2, 3, 4 and 8 bot players with two seeds each, plus a mid-round disconnect: the round must end, place every player once with correct points, and replay without stale state. |
| `npm run test:tournament` | Full 5-, 10- and 15-round tournaments over real WebSockets with bots voting, loading and playing; final totals equal the sum of round points; every client sees identical standings; rematch resets scores; host drop and rejoin, a player leaving, a late joiner, and a two-player tournament collapsing back to the lobby. |
| `npm run test:browser` | Two separate Chromium processes play through the real UI: create, join by code, ready, start, vote, intro, play with the keyboard, results. Checks the server moved the player from key presses, the *other* browser draws that player where the server says, Escape doesn't pause the match, both browsers show the server's results, and reload rejoins as the same player. Needs `npm i -D playwright && npx playwright install chromium`. |
| `npm run test:perf` | Four rooms of eight bot clients playing at once against a separate server process; reports tick cost, snapshot timing and bandwidth. |

### Results from the build environment

All of the following were run on a Linux cloud container:

- `npm test`: 32 of 32 passed.
- `npm run test:games`: all 15 minigames passed at every player count, including
  disconnect forfeits. Simulating one round costs about 0.01–0.06 ms per tick.
- `npm run test:tournament`: 5 rounds with 8 players, 10 rounds with 4 and 15 rounds with
  3 all reached final results with consistent scores, and the disruption and collapse
  cases passed.
- `npm run test:browser`: passed three runs in a row.
- `npm run test:perf` (32 connected players in 4 rooms): server step 0.37 ms on average
  for all rooms together (6.3 ms worst, budget 16.7 ms); about 140 kbit/s down per
  player; snapshot interval median 33.3 ms, 99th percentile 36.1 ms.

### Not verified

- **Separate computers and real networks.** Every multiplayer test ran on one machine
  over loopback. Play between different computers, over Wi-Fi or across the internet
  with real latency and packet loss has not been tested.
- **Deployment.** Nothing was deployed. The Render setup follows Render's standard Node
  service and has not been run on Render.
- **Eight real browsers.** Eight-player games were tested with eight bot clients over
  real WebSockets, and the UI with two real browsers. Eight browsers at once, each
  rendering, were not run.
- **Real GPUs and feel.** The browsers here used software rendering (about 15 fps on the
  low preset), so frame rate on real hardware, and how movement, jumping and camera feel
  at 60 fps, were judged only from code and slow-motion runs. Minigame balance was tuned
  with bots, not people.
- **Browsers other than Chromium,** touch devices and gamepads (keyboard play only).

## Licences

Code: MIT. Fonts: Bagel Fat One and Gabarito, SIL Open Font License (see `public/fonts`).
three.js, React and ws are MIT licensed.

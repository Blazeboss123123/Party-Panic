// Minigame selection and vote resolution.

// Choose up to three options for a voting phase.
// - teamGames=false removes team minigames from the pool.
// - allowRepeats=false removes games already played in this tournament. If fewer than three
//   unplayed eligible games remain, the remaining slots are filled with the least recently
//   played eligible games (documented fallback so voting can never get stuck).
export function chooseOptions({ games, played, allowRepeats, teamGames, playerCount, rng, count = 3 }) {
  const eligible = games.filter((g) => (teamGames || !g.team) && playerCount >= (g.minPlayers || 2));
  if (!eligible.length) return [];
  let pool = allowRepeats ? eligible.slice() : eligible.filter((g) => !played.includes(g.id));
  // Avoid offering the game that was just played when repeats are allowed (keeps variety).
  if (allowRepeats && played.length && pool.length > count) {
    pool = pool.filter((g) => g.id !== played[played.length - 1]);
  }
  rng.shuffle(pool);
  const options = pool.slice(0, count);
  if (options.length < count) {
    // Fallback: least recently played eligible games.
    const lastIndex = (id) => played.lastIndexOf(id);
    const rest = eligible
      .filter((g) => !options.includes(g))
      .sort((a, b) => lastIndex(a.id) - lastIndex(b.id));
    for (const g of rest) {
      if (options.length >= count) break;
      options.push(g);
    }
  }
  return options.map((g) => g.id);
}

// votes: Map(playerId -> gameId). Ties are broken randomly among the tied options.
// With no votes at all, a random option is chosen.
export function resolveVotes(options, votes, rng) {
  const counts = new Map(options.map((id) => [id, 0]));
  for (const v of votes.values()) if (counts.has(v)) counts.set(v, counts.get(v) + 1);
  let best = -1;
  let tied = [];
  for (const id of options) {
    const c = counts.get(id);
    if (c > best) { best = c; tied = [id]; }
    else if (c === best) tied.push(id);
  }
  const winner = tied[Math.floor(rng() * tied.length)];
  return { winner, counts: Object.fromEntries(counts), tied: tied.length > 1 };
}

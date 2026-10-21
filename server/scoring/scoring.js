// Server-side scoring. Clients never assign points: every minigame produces a ranking as
// ordered groups of player ids (best first, players in one group are tied), and this module
// turns that into placements and points using standard competition ranking (1, 2, 2, 4 ...).

import { PLACEMENT_POINTS } from '../../shared/constants.js';

export function pointsForPlace(place) {
  if (place < 1) return 0;
  return PLACEMENT_POINTS[Math.min(place, PLACEMENT_POINTS.length) - 1];
}

// groups: [[idA], [idB, idC], [idD]]  ->  [{ id, place, points }]
export function placementsFromGroups(groups) {
  const out = [];
  let better = 0;
  const seen = new Set();
  for (const group of groups) {
    const ids = group.filter((id) => !seen.has(id));
    if (!ids.length) continue;
    const place = better + 1;
    for (const id of ids) {
      seen.add(id);
      out.push({ id, place, points: pointsForPlace(place) });
    }
    better += ids.length;
  }
  return out;
}

// Sort items by a list of key functions (each returns a number; higher is better unless the
// key is wrapped with asc()). Items with identical keys share a group.
export function asc(fn) {
  return (x) => -fn(x);
}

export function groupBy(items, keyFns, idOf = (x) => x.id) {
  const keyed = items.map((it) => ({ it, k: keyFns.map((f) => {
    const v = f(it);
    return Number.isFinite(v) ? v : (v === Infinity ? 1e15 : -1e15);
  }) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) {
      if (a.k[i] !== b.k[i]) return b.k[i] - a.k[i];
    }
    return 0;
  });
  const groups = [];
  let prev = null;
  for (const e of keyed) {
    if (prev && prev.k.every((v, i) => Math.abs(v - e.k[i]) < 1e-9)) {
      groups[groups.length - 1].push(idOf(e.it));
    } else {
      groups.push([idOf(e.it)]);
    }
    prev = e;
  }
  return groups;
}

// Final tournament standings: total points, then round victories; remaining ties are shared.
export function finalStandings(players) {
  const groups = groupBy(players, [(p) => p.total, (p) => p.wins]);
  const placed = placementsFromGroups(groups);
  const byId = new Map(players.map((p) => [p.id, p]));
  return placed.map((r) => ({ ...byId.get(r.id), place: r.place }));
}

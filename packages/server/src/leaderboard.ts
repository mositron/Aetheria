// Simple in-memory leaderboard. Resets on server restart and at midnight Monday (week boundary).
// Each character's weekly score = kills + crafts + harvests, plus EXP gained / 10.

type Entry = { name: string; score: number; kills: number; level: number };
const board = new Map<string, Entry>();
let weekStart = startOfWeek(new Date());

function startOfWeek(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const dow = c.getDay();
  const diff = (dow + 6) % 7; // Monday = start
  c.setDate(c.getDate() - diff);
  return c.getTime();
}

function ensureWeek() {
  const now = startOfWeek(new Date());
  if (now !== weekStart) {
    board.clear();
    weekStart = now;
  }
}

export function recordContribution(name: string, points: number, killsDelta: number, level: number) {
  ensureWeek();
  const cur = board.get(name) ?? { name, score: 0, kills: 0, level };
  cur.score += points;
  cur.kills += killsDelta;
  cur.level = Math.max(cur.level, level);
  board.set(name, cur);
}

export function getTop(n = 10): Entry[] {
  ensureWeek();
  return Array.from(board.values()).sort((a, b) => b.score - a.score).slice(0, n);
}

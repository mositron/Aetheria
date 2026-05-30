// Weekly leaderboard — DB-backed (Prisma LeaderboardEntry) with in-memory
// cache for hot-path reads + batched writes.
//
// Week boundary = Monday 00:00 local time. Old weeks are kept in DB for
// history; getTop() filters by the current weekStart.

import { prisma } from "./db.js";

export type Entry = { name: string; score: number; kills: number; level: number };

let cache = new Map<string, Entry>();
let weekStart = startOfWeek(new Date());
let cacheLoaded = false;
const dirtyNames = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

function startOfWeek(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const dow = c.getDay();
  const diff = (dow + 6) % 7; // Monday = start
  c.setDate(c.getDate() - diff);
  return c.getTime();
}

/** Load the current week into the in-memory cache. Called lazily. */
async function loadCache() {
  if (cacheLoaded) return;
  try {
    const rows = await (prisma as any).leaderboardEntry.findMany({
      where: { weekStart: BigInt(weekStart) },
    });
    cache = new Map(rows.map((r: any) => [r.name, {
      name: r.name, score: r.score, kills: r.kills, level: r.level,
    }]));
  } catch (e) {
    console.warn("[leaderboard] cache load failed (continuing in-memory only):", e);
    cache = new Map();
  }
  cacheLoaded = true;
}

/** Flush dirty entries to DB. Debounced so high-frequency kills don't hammer the DB. */
async function flush() {
  if (dirtyNames.size === 0) return;
  const names = [...dirtyNames];
  // Snapshot weekStart + cache values BEFORE the first await. ensureWeek()
  // can run between awaits and reset cache + advance weekStart; without this
  // snapshot, entries past the first would be lost mid-rollover and the
  // remaining upserts would target the wrong week.
  const ws = BigInt(weekStart);
  const snap: Array<[string, Entry]> = [];
  for (const name of names) {
    const e = cache.get(name);
    if (e) snap.push([name, { ...e }]);
  }
  dirtyNames.clear();
  for (const [name, e] of snap) {
    try {
      await (prisma as any).leaderboardEntry.upsert({
        where:  { weekStart_name: { weekStart: ws, name } },
        update: { score: e.score, kills: e.kills, level: e.level },
        create: { weekStart: ws, name, score: e.score, kills: e.kills, level: e.level },
      });
    } catch (err) {
      // Re-queue on failure
      dirtyNames.add(name);
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flush();
  }, 2000);
}

/** Roll over to the new week when Monday 00:00 passes. */
function ensureWeek() {
  const now = startOfWeek(new Date());
  if (now !== weekStart) {
    // Flush any pending writes for the old week before rolling.
    void flush();
    weekStart = now;
    cache = new Map();
    cacheLoaded = false;
    dirtyNames.clear();
  }
}

export function recordContribution(name: string, points: number, killsDelta: number, level: number) {
  ensureWeek();
  // Fire-and-forget cache load — first read kicks it off; subsequent calls hit
  // the cache. Write path always updates cache immediately so reads are fresh.
  if (!cacheLoaded) void loadCache();
  const cur = cache.get(name) ?? { name, score: 0, kills: 0, level };
  cur.score += points;
  cur.kills += killsDelta;
  cur.level = Math.max(cur.level, level);
  cache.set(name, cur);
  dirtyNames.add(name);
  scheduleFlush();
}

export async function getTop(n = 10): Promise<Entry[]> {
  ensureWeek();
  if (!cacheLoaded) await loadCache();
  // Deterministic tie-break: score desc, then kills desc, then level desc,
  // finally name asc. Without explicit ordering, tied players' positions
  // depend on Map insertion order which can shuffle across restarts.
  return Array.from(cache.values()).sort((a, b) =>
    b.score - a.score
    || b.kills - a.kills
    || b.level - a.level
    || a.name.localeCompare(b.name)
  ).slice(0, n);
}

/** Test helper — clear cache + DB rows for the current week. */
export async function _resetForTest() {
  try {
    await (prisma as any).leaderboardEntry.deleteMany({ where: { weekStart: BigInt(weekStart) } });
  } catch {}
  cache.clear();
  dirtyNames.clear();
  cacheLoaded = false;
}

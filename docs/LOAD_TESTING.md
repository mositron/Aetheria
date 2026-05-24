# Load Testing

Two harness scripts ship for measuring server capacity. Both target the
SERVER_SIZING_50_PLAYERS.md acceptance criteria (p95 < 200ms, CPU < 70%,
50 concurrent players per room).

## Path A — k6 WebSocket flood (no auth)

`tools/k6/loadtest-room.js` opens raw WebSocket connections at the matchmaking
endpoint. Useful for measuring connection limits and edge proxy behavior,
**not** real gameplay, since it skips Colyseus matchmaking.

```bash
pnpm loadtest                          # 50 VUs × 60s
K6_VUS=100 K6_DURATION=120s pnpm loadtest
```

## Path B — colyseus.js bot harness (real protocol)

`tools/harness-runner.ts` connects N bots through the official SDK and joins
the `world` room, drives 20 Hz input messages.

```bash
# Terminal 1
pnpm --filter @game/server dev

# Terminal 2 — small smoke
BOT_COUNT=5 DURATION_MS=10000 pnpm test:harness

# Terminal 2 — full target (50 bots, 60s)
BOT_COUNT=50 DURATION_MS=60000 pnpm test:harness
```

### Prerequisite — bot auth fixture

`WorldRoom.onJoin` requires a real `characterId` from the database. The harness
joins with `token: "dev:bot_N"` which the server rejects with `4216 missing
characterId`.

To run a full bot load test, you must either:

1. **Seed test characters first** — script that creates 50 users + characters
   in Prisma and exports their IDs into the harness env (recommended for
   reproducible numbers).

   ```ts
   // tools/seed-load-bots.ts (TODO — small wrapper around prisma.user.create)
   ```

2. **Use the in-room DEV_BOTS path** for quick smoke. Cap is 8 (set in
   `WorldRoom.ts:324`) — raise locally if you need more.

   ```bash
   DEV_BOTS=8 pnpm --filter @game/server dev
   curl http://localhost:2567/health   # players field shows bots joined
   ```

## What metrics to watch

| Source | Field | Target |
|---|---|---|
| Harness output | `rtt p95` | < 200ms |
| `/health` JSON | `players` | matches expected |
| Server logs | `tick duration p95` | < 40ms |
| OS | CPU per server process | < 70% sustained |
| OS | RSS memory | stable, no leak slope |

## Where results go

Update `docs/SERVER_SIZING_50_PLAYERS.md` with hardware spec + observed
numbers after each significant run, so the next session has a baseline to
compare against.

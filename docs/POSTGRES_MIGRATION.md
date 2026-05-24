# Migrating from SQLite to Postgres

SQLite is the default for fast local dev. For production (multi-instance, >1k
concurrent players, multi-region) switch to Postgres.

## 1. Stop the server

Free the SQLite file before exporting.

```bash
# Kill any running pnpm dev / docker compose
```

## 2. Export current data (optional)

```bash
cd packages/server
pnpm exec prisma db pull          # snapshot schema from SQLite
sqlite3 prisma/dev.db .dump > backup.sql
```

## 3. Switch the datasource

In `packages/server/prisma/schema.prisma` change:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }
```

## 4. Point DATABASE_URL at Postgres

In `.env`:

```env
DATABASE_URL="postgresql://aetheria:aetheria@localhost:5432/aetheria?schema=public"
```

For docker-compose the stack already wires this for you (`server1`, `server2`
services). Just run `docker compose up postgres`.

## 5. Re-baseline migrations

SQLite migrations are not portable. Drop the old migrations folder and
generate a Postgres baseline:

```bash
cd packages/server
rm -rf prisma/migrations
pnpm exec prisma migrate dev --name postgres_baseline
```

This creates `prisma/migrations/<ts>_postgres_baseline/migration.sql` and
applies it.

## 6. Re-import data (if you exported)

The SQLite dump is **not** directly Postgres-compatible. Easiest path:

- Use a tool like `pgloader` (recommended for non-trivial datasets):

```bash
pgloader sqlite:///$(pwd)/prisma/dev.db \
  postgresql://aetheria:aetheria@localhost:5432/aetheria
```

- Or for a small dataset, write a one-off node script that reads from
  `new PrismaClient({ datasources: { db: { url: "file:./prisma/dev.db" } } })`
  and writes to the new Postgres URL.

## 7. Verify

```bash
pnpm test                                # server + shared suites
pnpm --filter @game/server exec prisma studio    # GUI to inspect tables
```

## Reverting

To go back, swap `provider` to `sqlite` again, set `DATABASE_URL=file:./prisma/dev.db`,
restore from `prisma/dev.db` (gitignored, not in git), and re-baseline.

## When to switch

- Concurrent players approaching SQLite's WAL ceiling (~1000)
- Need >1 server replica writing to the same database
- Want point-in-time recovery / replication / read replicas

# Aetheria — Runbook

Day-to-day ops for a deployed Aetheria. Pair with `docs/DEPLOY.md`
(first-time setup).

---

## SSH + locations

```bash
ssh aetheria@aetheria.example.com
cd /opt/aetheria
```

Key paths on the VPS:
- `/opt/aetheria/`               — repo checkout
- `/opt/aetheria/.env`           — production secrets (gitignored)
- `/var/backups/aetheria/`       — pg_dump rotations (7 days)
- `/var/log/aetheria-backup.log` — backup cron log

Docker volumes (managed by compose):
- `aetheria_postgres_data`
- `aetheria_redis_data`
- `aetheria_caddy_data`, `aetheria_caddy_config` (TLS cert cache)

---

## Daily checks

```bash
# All containers healthy?
docker compose -f docker-compose.prod.yml ps

# Live tail
docker compose -f docker-compose.prod.yml logs -f --tail=200

# Just the server
docker compose -f docker-compose.prod.yml logs -f server

# Recent slow ticks (> 40ms warnings)
docker compose -f docker-compose.prod.yml logs server | grep "Tick slow"

# Metrics dashboard in browser
open "https://aetheria.example.com/metrics?token=$ADMIN_TOKEN"
```

---

## Deploy a new version

From your laptop:

```bash
# 1. Tag + push to trigger GHCR build
git tag v0.2.0 && git push origin v0.2.0

# 2. Wait for GitHub Actions to finish (~5 min) — watch in the Actions tab

# 3. Deploy that tag
TAG=v0.2.0 DEPLOY_HOST=aetheria.example.com ./scripts/deploy.sh
```

Zero-downtime: `deploy.sh` pulls the new image then `compose up -d --no-deps server`
restarts only the server container (postgres + redis untouched).

---

## Rollback to previous version

```bash
ssh aetheria@aetheria.example.com
cd /opt/aetheria

# List versions on GHCR (use the GitHub Packages UI), then:
TAG=v0.1.9 docker compose -f docker-compose.prod.yml up -d --no-deps server

# Verify
docker compose -f docker-compose.prod.yml ps
curl -s https://aetheria.example.com/health | jq .uptime
```

If migrations from the newer version are already applied and the older
image doesn't expect them, *they usually still work* (additive
migrations only). If a migration was destructive, you must restore from
backup first (next section) before rolling back.

---

## Restore from backup

```bash
ssh aetheria@aetheria.example.com
cd /opt/aetheria

# Pick a snapshot
ls -lh /var/backups/aetheria/

# Stop the server so writes don't race the restore
docker compose -f docker-compose.prod.yml stop server

# Wipe + recreate the DB, then pipe the dump in
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U aetheria -d postgres -c "DROP DATABASE aetheria; CREATE DATABASE aetheria OWNER aetheria;"

gunzip -c /var/backups/aetheria/aetheria-2026-05-25T03-00-00Z.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U aetheria -d aetheria

# Bring server back up
docker compose -f docker-compose.prod.yml start server
```

---

## Common issues

### `server` container restart-looping
1. `docker compose logs server` — read the last 50 lines.
2. Usual culprits:
   - `JWT_SECRET` < 32 chars → fatal exit. Fix `.env` and re-up.
   - Postgres not ready → check `postgres` health; restart it first.
   - Pending migration that requires a column not in older code → rollback then
     restore from pre-migration backup.

### TLS cert won't issue
- Check `docker compose logs caddy` — Let's Encrypt rate-limits if you've
  restarted Caddy many times in an hour.
- Verify `DOMAIN` in `.env` matches an A record pointing at this VPS.
- Open port 80 + 443 in firewall + provider's network rules.

### High tick latency (> 40ms p95)
- `/metrics?token=...` shows per-room stats. If memory growing too,
  the room has too many entities — check player count vs spawn density.
- Restart server (drops all players — coordinate first):
  `docker compose restart server`

### Disk full
- `df -h` — check `/var/lib/docker` size.
- `docker system prune -a --volumes` (BE CAREFUL — this wipes unused volumes;
  ensure backup volumes are excluded by tagging or by checking output first).
- Local backup rotation keeps 7. If you push to B2 you can lower that.

---

## Adding a maintenance window (planned downtime)

```bash
# Pre-announce in-game via /metrics admin or directly:
# (no chat-admin tool yet — broadcast via server logger or restart with a banner env)

# Take down for upgrade
docker compose -f docker-compose.prod.yml down

# ...do the thing...

docker compose -f docker-compose.prod.yml up -d
```

---

## Owners + contacts

(Fill in for your team)

- Domain / DNS:  ___
- VPS account:   ___
- GHCR:          ___
- Backups (B2):  ___
- Sentry:        ___
- On-call rotation: ___

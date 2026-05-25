# Aetheria — Production Deploy Guide

First-time setup of a real VPS running the full Aetheria stack with TLS,
backups, and CI auto-deploy. Time estimate: ~90 minutes end to end.

---

## 0. Prerequisites

You need:
- A domain you own + DNS access (Cloudflare/Namecheap/etc.)
- A VPS — recommended: **Hetzner CX22** (Ubuntu 22.04 LTS, 2 vCPU, 4 GB RAM,
  Singapore region for low TH latency, ~$4.50/mo). DigitalOcean/Vultr work too.
- An SSH key on your laptop (`~/.ssh/id_ed25519.pub`)
- A GitHub account with write access to this repo (for GHCR push)

---

## 1. Provision the VPS (5 min)

On the provider dashboard:
1. Create a server with **Ubuntu 22.04 LTS**.
2. Add your SSH public key at create time (no password login).
3. Copy the public IPv4 + IPv6 addresses.

Then SSH in as root for first-time setup:

```bash
ssh root@<vps-ip>

# Create non-root user 'aetheria'
adduser --disabled-password --gecos "" aetheria
usermod -aG sudo aetheria
mkdir -p /home/aetheria/.ssh
cp ~/.ssh/authorized_keys /home/aetheria/.ssh/
chown -R aetheria:aetheria /home/aetheria/.ssh
chmod 700 /home/aetheria/.ssh && chmod 600 /home/aetheria/.ssh/authorized_keys

# Lock root login + password auth
sed -i 's/#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall — only SSH + HTTP + HTTPS
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# Install Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker aetheria

# Install git + jq (helpful)
apt-get install -y git jq

exit
```

Re-login as the new user — root should be locked out:

```bash
ssh aetheria@<vps-ip>
```

---

## 2. DNS setup (5 min, propagation 5–60 min)

Add A records pointing your domain at the VPS:

```
aetheria.example.com.     A    <vps-ipv4>
aetheria.example.com.     AAAA <vps-ipv6>   # optional
```

Verify: `dig +short aetheria.example.com` should return the VPS IP.

Caddy will auto-provision a Let's Encrypt cert the first time the
container starts — no manual cert work needed.

---

## 3. Clone repo + create .env (5 min)

```bash
# On VPS
sudo mkdir -p /opt/aetheria
sudo chown aetheria:aetheria /opt/aetheria
cd /opt/aetheria
git clone https://github.com/<your-org>/Aetheria.git .

# Create production .env
cp .env.production.example .env

# Generate strong secrets
JWT=$(openssl rand -base64 48 | tr -d '\n')
PG=$(openssl rand -base64 24 | tr -d '\n=+/')
ADMIN=$(openssl rand -hex 24)

# Edit .env — replace placeholders with the values above + your domain
nano .env
```

Required fields in `.env` (full template in `.env.production.example`):

```
DOMAIN=aetheria.example.com
JWT_SECRET=<paste $JWT — must be >=32 chars>
POSTGRES_PASSWORD=<paste $PG>
ADMIN_TOKEN=<paste $ADMIN>
ALLOWED_ORIGINS=https://aetheria.example.com
ENFORCE_HTTPS=true
GHCR_OWNER=<your-github-username-lowercased>
TAG=latest
# Optional:
# SENTRY_DSN=https://...
# CAPTCHA_SECRET=0x...
```

---

## 4. First deploy (10 min)

The server image is hosted on GitHub Container Registry (GHCR). Build &
push it from your laptop *once* before the first deploy:

```bash
# On laptop — tag and push
git tag v0.1.0 && git push origin v0.1.0
# GitHub Actions builds + pushes ghcr.io/<owner>/aetheria-server:v0.1.0 + :latest
```

Watch the Actions tab on GitHub until the workflow succeeds (~5 min).

Then on the VPS:

```bash
cd /opt/aetheria
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
```

You should see:
1. `caddy_1   | obtaining TLS certificate for aetheria.example.com`
2. `postgres_1 | database system is ready to accept connections`
3. `server_1  | [entrypoint] applying database migrations...`
4. `server_1  | server.listening port=2567 nodeEnv=production`

Open `https://aetheria.example.com` in a browser — you should see the login screen.

---

## 5. Verify

```bash
# Health
curl -s https://aetheria.example.com/health | jq

# Metrics (token-gated — use your ADMIN_TOKEN)
curl -s "https://aetheria.example.com/metrics?token=$ADMIN_TOKEN" | head -20

# Try registering a test account through the web UI
```

---

## 6. Set up backups (5 min)

```bash
sudo mkdir -p /var/backups/aetheria
sudo chown aetheria:aetheria /var/backups/aetheria

# Test one backup now
/opt/aetheria/scripts/backup-pg.sh

# Add cron — every day at 3 AM UTC
crontab -e
```

Add:

```
0 3 * * * /opt/aetheria/scripts/backup-pg.sh >> /var/log/aetheria-backup.log 2>&1
```

Optional off-site backup via Backblaze B2 (10 GB free):

```bash
sudo apt-get install -y rclone
rclone config   # interactive — choose Backblaze B2, paste keyID + appKey
# then set in /opt/aetheria/.env or via export:
echo "RCLONE_REMOTE=b2remote:aetheria-backups" | sudo tee -a /etc/environment
```

---

## 7. Auto-deploy on new git tags (10 min)

Add SSH deploy key to GitHub repo secrets:

```bash
# On laptop — generate a dedicated deploy key
ssh-keygen -t ed25519 -f ~/.ssh/aetheria_deploy -N ""

# Copy the public key to VPS
ssh-copy-id -i ~/.ssh/aetheria_deploy.pub aetheria@<vps-ip>

# Print the private key (paste into GitHub Secrets as DEPLOY_SSH_KEY)
cat ~/.ssh/aetheria_deploy
```

In the GitHub repo → Settings → Secrets → Actions, add:
- `DEPLOY_SSH_KEY` — the private key above
- `DEPLOY_HOST` — your domain or IP
- `DEPLOY_USER` — `aetheria`

(Optional — write a `deploy.yml` workflow that triggers `scripts/deploy.sh`
after `docker-publish.yml` succeeds. The repo doesn't ship one out of the
box because policies vary; copy `scripts/deploy.sh` into a workflow_run
trigger if desired.)

For now, manual deploys are one command from your laptop:

```bash
TAG=v0.2.0 DEPLOY_HOST=aetheria.example.com ./scripts/deploy.sh
```

---

## 8. What's next?

- `docs/RUNBOOK.md` — daily ops, log viewing, rollback, restore steps
- `docs/CRON_BACKUP.md` — backup details + restore drill
- Monitor `/health` via UptimeRobot (free)
- Watch errors via Sentry (set `SENTRY_DSN` in `.env`)

If anything fails, check `docker compose logs <service>` first — most
issues are env-var typos in `.env`.

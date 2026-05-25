#!/usr/bin/env bash
# Deploy a new image to the production VPS.
#
# Reads DEPLOY_HOST + DEPLOY_USER from environment (or args). Assumes:
#   - SSH key in agent (no password prompt)
#   - VPS has /opt/aetheria checkout with docker-compose.prod.yml + .env
#   - GHCR_OWNER + TAG already in the VPS's .env (or passed via env)
#
# Usage:
#   ./scripts/deploy.sh                                  # deploys :latest
#   TAG=v0.2.0 ./scripts/deploy.sh                       # pin a tag
#   DEPLOY_HOST=1.2.3.4 DEPLOY_USER=aetheria ./scripts/deploy.sh
#
# Rollback (run on VPS):
#   TAG=v0.1.9 docker compose -f docker-compose.prod.yml up -d server

set -euo pipefail

HOST="${DEPLOY_HOST:?DEPLOY_HOST env required (e.g. aetheria.example.com)}"
USER="${DEPLOY_USER:-aetheria}"
TAG="${TAG:-latest}"
APP_DIR="${APP_DIR:-/opt/aetheria}"

echo "==> Deploying tag '${TAG}' to ${USER}@${HOST}:${APP_DIR}"

ssh -o StrictHostKeyChecking=accept-new "${USER}@${HOST}" bash -se <<EOF
  set -euo pipefail
  cd "${APP_DIR}"

  echo "--> git pull origin main"
  git pull --ff-only origin main

  echo "--> docker compose pull (TAG=${TAG})"
  TAG="${TAG}" docker compose -f docker-compose.prod.yml pull server

  echo "--> docker compose up -d --no-deps server (zero-downtime restart)"
  TAG="${TAG}" docker compose -f docker-compose.prod.yml up -d --no-deps server

  echo "--> waiting for server health..."
  for i in \$(seq 1 30); do
    if docker compose -f docker-compose.prod.yml ps server | grep -q "healthy"; then
      echo "    healthy ✓"
      exit 0
    fi
    sleep 2
  done
  echo "!! server did not become healthy in 60s — check 'docker compose logs server'"
  exit 1
EOF

echo "==> Deploy complete. Server reachable at https://${HOST}"

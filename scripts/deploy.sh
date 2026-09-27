#!/usr/bin/env bash
# Deploy an image tag to the OCI Always Free VM (used by CI; also works by hand).
#
#   VM_HOST=<ip-or-dns> VM_USER=ubuntu IMAGE_TAG=<tag> [SSH_KEY_FILE=~/.ssh/id_ed25519] \
#     scripts/deploy.sh
#
# Copies serving/docker-compose.yml to $APP_DIR on the VM, sets IMAGE_TAG in the VM's
# .env (so reboots/systemd use the same tag), pulls, restarts, and waits for every
# service's Docker healthcheck. If they don't turn healthy, it rolls back to the
# previous IMAGE_TAG and exits non-zero.
#
# One-time VM prerequisites (scripts/vm/setup.sh + docs/DEPLOYMENT.md): Docker + compose,
# $APP_DIR/.env filled in, and `docker login <region>.ocir.io` done as $VM_USER.
set -euo pipefail

: "${VM_HOST:?set VM_HOST}"
: "${VM_USER:?set VM_USER}"
: "${IMAGE_TAG:?set IMAGE_TAG}"
APP_DIR="${APP_DIR:-/opt/ml-app}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
if [ -n "${SSH_KEY_FILE:-}" ]; then
  SSH_OPTS+=(-i "$SSH_KEY_FILE")
fi
if [ -s "$HOME/.ssh/known_hosts" ]; then
  SSH_OPTS+=(-o StrictHostKeyChecking=yes)
else
  echo "warning: no known_hosts - trusting the VM's host key on first use" >&2
  SSH_OPTS+=(-o StrictHostKeyChecking=accept-new)
fi
TARGET="$VM_USER@$VM_HOST"

echo "==> copying docker-compose.yml to $TARGET:$APP_DIR"
scp "${SSH_OPTS[@]}" "$REPO_ROOT/serving/docker-compose.yml" "$TARGET:$APP_DIR/docker-compose.yml"

echo "==> deploying IMAGE_TAG=$IMAGE_TAG"
# shellcheck disable=SC2087  # expand the three vars locally, everything else remotely
ssh "${SSH_OPTS[@]}" "$TARGET" \
  APP_DIR="$APP_DIR" NEW_TAG="$IMAGE_TAG" HEALTH_TIMEOUT="$HEALTH_TIMEOUT" bash -s <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
[ -f .env ] || { echo "error: $APP_DIR/.env missing - copy serving/.env.example and fill it in" >&2; exit 1; }

set_tag() {
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$1|" .env
  else
    echo "IMAGE_TAG=$1" >> .env
  fi
}

wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  if [ -z "$(docker compose ps -q)" ]; then
    echo "no services running - is COMPOSE_PROFILES set in .env?" >&2
    return 1
  fi
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local pending=0
    for id in $(docker compose ps -q); do
      local status
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
      case "$status" in
        healthy) ;;
        unhealthy) echo "container $id is unhealthy" >&2; return 1 ;;
        *) pending=1 ;;
      esac
    done
    [ "$pending" -eq 0 ] && return 0
    sleep 5
  done
  echo "timed out after ${HEALTH_TIMEOUT}s waiting for healthy containers" >&2
  return 1
}

PREV_TAG=$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)
set_tag "$NEW_TAG"

docker compose pull
docker compose up -d --remove-orphans

if wait_healthy; then
  docker compose ps
  docker image prune -f >/dev/null
  echo "deployed $NEW_TAG (previous: ${PREV_TAG:-none})"
  exit 0
fi

docker compose logs --tail=50 >&2
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$NEW_TAG" ]; then
  echo "rolling back to $PREV_TAG" >&2
  set_tag "$PREV_TAG"
  docker compose up -d --remove-orphans
  wait_healthy || echo "rollback is not healthy either - investigate on the VM" >&2
fi
exit 1
REMOTE

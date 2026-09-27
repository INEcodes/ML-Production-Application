#!/usr/bin/env bash
# One-time provisioning of an OCI Always Free VM running Ubuntu 22.04/24.04:
# Ampere A1 (arm64) or E2.1.Micro (amd64, 1 GB RAM - a swapfile is added).
# Idempotent: safe to re-run.
#
# On the VM, from a directory containing this script + nginx-ml-app.conf + ml-app.service:
#   sudo DOMAIN=api.example.com EMAIL=you@example.com bash setup.sh
#
# DOMAIN/EMAIL are optional: without them nginx serves plain HTTP on any hostname and
# certbot is skipped (re-run with both set once DNS points at the VM). No domain? Use
# <public-ip-with-dashes>.sslip.io, e.g. 129-1-2-3.sslip.io - Let's Encrypt accepts it.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || { echo "this script targets Ubuntu (found ${ID:-unknown})" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-ubuntu}}"
APP_DIR="${APP_DIR:-/opt/ml-app}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
export DEBIAN_FRONTEND=noninteractive

# E2.1.Micro has 1 GB RAM: one serving container (~250-300 MB with torch) fits, but
# image pulls and a second model can spike past it. Swap turns an OOM kill into slowness.
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 2000000 ] && ! swapon --show | grep -q '^/swapfile'; then
  echo "==> ${mem_kb} kB RAM: adding a 2 GB swapfile"
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-ml-app-swap.conf
fi

echo "==> base packages"
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg nginx certbot python3-certbot-nginx \
  iptables-persistent

echo "==> docker engine + compose plugin"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
    docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

echo "==> host firewall: allow 80/443"
# OCI's Ubuntu images ship an iptables INPUT chain ending in REJECT; the VCN Security
# List opens the ports at the network level, this opens them on the host.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    pos=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
    iptables -I INPUT "${pos:-1}" -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  fi
done
netfilter-persistent save

echo "==> app directory $APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "    (no .env yet - copy serving/.env.example to $APP_DIR/.env and fill it in)"
fi

echo "==> systemd unit (brings the stack up on boot)"
sed "s|__APP_DIR__|$APP_DIR|g" "$HERE/ml-app.service" > /etc/systemd/system/ml-app.service
systemctl daemon-reload
systemctl enable ml-app.service

echo "==> nginx reverse proxy"
sed "s|__DOMAIN__|${DOMAIN:-_}|g" "$HERE/nginx-ml-app.conf" > /etc/nginx/sites-available/ml-app
ln -sf /etc/nginx/sites-available/ml-app /etc/nginx/sites-enabled/ml-app
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  echo "==> TLS certificate for $DOMAIN (Let's Encrypt)"
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
  # certbot's package installs a systemd timer that renews automatically.
else
  echo "==> skipping TLS: set DOMAIN and EMAIL and re-run once DNS points here"
fi

cat <<EOF

Done. Remaining one-time steps (as $DEPLOY_USER, after logging out/in for the docker group):
  1. $APP_DIR/.env                 <- serving/.env.example, filled in (chmod 600)
  2. docker login <region>.ocir.io -u '<namespace>/<username>'   (password = OCI auth token)
  3. first deploy: push to main (CI) or run scripts/deploy.sh from your machine
EOF

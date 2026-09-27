#!/usr/bin/env bash
# One-time provisioning of an OCI Always Free VM. Supported OS images:
#   - Oracle Linux 8/9 (OCI's default image, user `opc`)
#   - Ubuntu 22.04/24.04 (user `ubuntu`)
# on Ampere A1 (arm64) or E2.1.Micro (amd64, 1 GB RAM - swap is added).
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
case "${ID:-}" in
  ubuntu) OS=ubuntu ;;
  ol|rhel|centos|rocky|almalinux) OS=el; EL_MAJOR="${VERSION_ID%%.*}" ;;
  *) echo "unsupported OS '${ID:-unknown}' - use Oracle Linux 8/9 or Ubuntu" >&2; exit 1 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$([ "$OS" = ubuntu ] && echo ubuntu || echo opc)}}"
APP_DIR="${APP_DIR:-/opt/ml-app}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

# E2.1.Micro has 1 GB RAM: one serving container (~250-300 MB with torch) fits, but
# image pulls and a second model can spike past it. Swap turns an OOM kill into slowness.
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 2000000 ] && [ "$swap_kb" -lt 1500000 ]; then
  echo "==> ${mem_kb} kB RAM, ${swap_kb} kB swap: adding a 2 GB swapfile"
  if [ ! -f /swapfile ]; then
    # dd rather than fallocate: works for swap on every filesystem (incl. XFS on OL).
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon --show | grep -q '^/swapfile' || swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-ml-app-swap.conf
fi

install_ubuntu() {
  export DEBIAN_FRONTEND=noninteractive
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

  NGINX_SITE=/etc/nginx/sites-available/ml-app
  sed "s|__DOMAIN__|${DOMAIN:-_}|g" "$HERE/nginx-ml-app.conf" > "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/ml-app
  rm -f /etc/nginx/sites-enabled/default
}

install_el() {
  echo "==> base packages (EPEL for certbot)"
  dnf install -y -q dnf-plugins-core curl
  if [ "${ID}" = "ol" ]; then
    dnf install -y -q "oracle-epel-release-el${EL_MAJOR}"
    dnf config-manager --set-enabled "ol${EL_MAJOR}_developer_EPEL" || true
  else
    dnf install -y -q epel-release
  fi
  dnf install -y -q nginx certbot python3-certbot-nginx

  echo "==> docker engine + compose plugin"
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    # Oracle Linux ships podman/buildah/runc, which conflict with Docker's containerd.io.
    # Some images ship a podman-docker shim as `docker`; remove it too.
    dnf remove -y -q podman podman-docker buildah runc 2>/dev/null || true
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
      docker-compose-plugin
  fi

  echo "==> host firewall: allow 80/443 (firewalld)"
  if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
    firewall-cmd --reload >/dev/null
  fi

  # SELinux blocks nginx from proxying to local ports by default.
  if command -v getenforce >/dev/null && [ "$(getenforce)" != "Disabled" ]; then
    setsebool -P httpd_can_network_connect 1
  fi

  NGINX_SITE=/etc/nginx/conf.d/ml-app.conf
  sed "s|__DOMAIN__|${DOMAIN:-_}|g" "$HERE/nginx-ml-app.conf" > "$NGINX_SITE"
  # The stock nginx.conf has its own `default_server` welcome page on :80. conf.d is
  # included before it, so dropping that flag makes this site answer requests by IP.
  sed -i 's/ default_server//' /etc/nginx/nginx.conf
}

"install_$OS"

systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

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
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  echo "==> TLS certificate for $DOMAIN (Let's Encrypt)"
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
  # Ubuntu's certbot package enables its renew timer itself; EPEL's doesn't.
  systemctl enable --now certbot-renew.timer 2>/dev/null || true
else
  echo "==> skipping TLS: set DOMAIN and EMAIL and re-run once DNS points here"
fi

cat <<EOF

Done. Remaining one-time steps (as $DEPLOY_USER, after logging out/in for the docker group):
  1. $APP_DIR/.env                 <- serving/.env.example, filled in (chmod 600)
  2. docker login <region>.ocir.io -u '<namespace>/<username>'   (password = OCI auth token)
  3. first deploy: push to main (CI) or run scripts/deploy.sh from your machine
EOF

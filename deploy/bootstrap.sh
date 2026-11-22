#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 / Debian 12 VPS, run as root:
#   curl -fsSL https://raw.githubusercontent.com/VulkreoN/pokedex-GO/main/deploy/bootstrap.sh -o bootstrap.sh
#   less bootstrap.sh            # read it first
#   bash bootstrap.sh "ssh-ed25519 AAAA... github-actions-deploy"
# Installs Docker, a firewall (SSH, HTTP, HTTPS only), automatic security updates, a "deploy" user that CI logs in
# with (key given as argument), /opt/mydexpogo and the nightly backup.
set -euo pipefail
DEPLOY_KEY="${1:?usage: bootstrap.sh \"<public SSH key used by GitHub Actions>\"}"
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
. /etc/os-release

apt-get update
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades cron

# Docker from Docker's own apt repository.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Firewall: SSH, HTTP (certificate challenge + redirect), HTTPS (TCP and QUIC).
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Security updates install themselves.
dpkg-reconfigure -f noninteractive unattended-upgrades

# The user CI deploys with: Docker access, nothing else.
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_KEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$DEPLOY_KEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy /opt/mydexpogo
echo "30 3 * * * deploy /opt/mydexpogo/backup.sh nightly >> /opt/mydexpogo/backups.log 2>&1" > /etc/cron.d/mydexpogo-backup

echo
echo "Done. Next: create /opt/mydexpogo/.env from deploy/.env.prod.example (as user deploy), point the domain's"
echo "A/AAAA records to this server, then push to main: GitHub Actions deploys."

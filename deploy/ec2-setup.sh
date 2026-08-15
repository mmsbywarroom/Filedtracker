#!/usr/bin/env bash
set -euo pipefail

# Run once on the EC2 instance (Ubuntu/Amazon Linux with sudo).
# Usage: sudo bash deploy/ec2-setup.sh

APP_DIR=/opt/filedtracker

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl git nginx
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
elif command -v yum >/dev/null 2>&1; then
  yum update -y
  yum install -y docker git nginx
  systemctl enable --now docker
  mkdir -p /usr/libexec/docker/cli-plugins
  curl -SL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/libexec/docker/cli-plugins/docker-compose
  chmod +x /usr/libexec/docker/cli-plugins/docker-compose
fi

systemctl enable --now docker
usermod -aG docker "${SUDO_USER:-ec2-user}" || true

mkdir -p "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
DATABASE_URL=postgresql://fieldtrack:CHANGE_DB_PASSWORD@db:5432/fieldtrack
POSTGRES_PASSWORD=CHANGE_DB_PASSWORD
JWT_SECRET=CHANGE_JWT_SECRET
ADMIN_EMAIL=admin@fieldtrack.local
ADMIN_PASSWORD=CHANGE_ADMIN_PASSWORD
FAST2SMS_API_KEY=
FAST2SMS_SENDER_ID=VIDEHE
FAST2SMS_MESSAGE_ID=209634
DLT_TEMPLATE_ID=1007181628875366114
EOF
  chmod 600 "$APP_DIR/.env"
  echo "Created $APP_DIR/.env — edit secrets before first deploy."
fi

if [ -f "$(dirname "$0")/nginx.conf" ]; then
  cp "$(dirname "$0")/nginx.conf" /etc/nginx/conf.d/filedtracker.conf || cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/filedtracker
fi

systemctl enable --now nginx || true
nginx -t && systemctl reload nginx || true

echo "EC2 bootstrap done. Put app files in $APP_DIR then: cd $APP_DIR && docker compose up -d --build"

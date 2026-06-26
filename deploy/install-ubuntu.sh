#!/usr/bin/env bash
# Установка Ultimate Snake Attack на Ubuntu (22.04 / 24.04)
# Запуск на сервере: sudo bash install-ubuntu.sh

set -euo pipefail

APP_DIR="/opt/snake-attack"
APP_USER="snake"
APP_PORT="${APP_PORT:-8080}"
PUBLIC_HOST="${PUBLIC_HOST:-176.123.166.78}"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Запусти от root: sudo bash install-ubuntu.sh"
  exit 1
fi

echo "==> Обновление пакетов…"
apt-get update -qq
apt-get install -y curl ca-certificates ufw

echo "==> Установка Node.js 20 LTS…"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Пользователь ${APP_USER}…"
if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> Копирование файлов в ${APP_DIR}…"
mkdir -p "${APP_DIR}"

# Скрипт ожидает, что запускают из папки проекта (где server.js)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  "${SCRIPT_DIR}/" "${APP_DIR}/"

echo "==> config.json…"
cat > "${APP_DIR}/config.json" <<EOF
{
  "bindHost": "0.0.0.0",
  "port": ${APP_PORT},
  "publicHost": "${PUBLIC_HOST}",
  "publicProtocol": "http"
}
EOF

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> systemd-сервис…"
cp "${APP_DIR}/deploy/snake-attack.service" /etc/systemd/system/snake-attack.service
systemctl daemon-reload
systemctl enable snake-attack
systemctl restart snake-attack

echo "==> Файрвол UFW (порт ${APP_PORT})…"
ufw allow OpenSSH
ufw allow "${APP_PORT}/tcp"
ufw --force enable

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Готово!"
echo "  Игра:     http://${PUBLIC_HOST}:${APP_PORT}"
echo "  Статус:   systemctl status snake-attack"
echo "  Логи:     journalctl -u snake-attack -f"
echo "══════════════════════════════════════════════════════"
echo ""

systemctl --no-pager status snake-attack || true

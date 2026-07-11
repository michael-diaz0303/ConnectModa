#!/bin/bash
# scripts/setup-server.sh
# Configura un VPS (Ubuntu 22.04) desde cero para ConnectModa
# Uso: bash setup-server.sh

set -e

echo "🚀 ConnectModa — Setup de servidor"
echo "=================================="

# ─── 1. Actualizar sistema ────────────────────────────────────────────────────
apt-get update && apt-get upgrade -y
apt-get install -y curl git wget ufw fail2ban

# ─── 2. Instalar Docker ───────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
  systemctl enable docker
  systemctl start docker
fi

# ─── 3. Instalar Docker Compose ───────────────────────────────────────────────
if ! command -v docker-compose &> /dev/null; then
  echo "Instalando Docker Compose..."
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d'"' -f4)
  curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# ─── 4. Crear estructura de directorios ───────────────────────────────────────
mkdir -p /opt/connectmoda/{logs,uploads,backups}
chmod 755 /opt/connectmoda

# ─── 5. Firewall ─────────────────────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── 6. Fail2ban para protección SSH ─────────────────────────────────────────
systemctl enable fail2ban
systemctl start fail2ban

# ─── 7. GitHub Container Registry login ──────────────────────────────────────
echo "⚠️  Para autenticarte con ghcr.io, ejecuta:"
echo "   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin"

echo ""
echo "✅ Servidor configurado. Próximos pasos:"
echo "   1. Copiar .env.production a /opt/connectmoda/"
echo "   2. Copiar docker-compose.production.yml a /opt/connectmoda/"
echo "   3. Autenticarse en ghcr.io"
echo "   4. Correr: cd /opt/connectmoda && docker-compose -f docker-compose.production.yml up -d"

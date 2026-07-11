#!/bin/bash
# scripts/rollback.sh
# Rollback manual a una versión anterior de ConnectModa
# Uso: bash rollback.sh [version]
# Ejemplo: bash rollback.sh v1.1.0

set -e

REGISTRY="ghcr.io"
IMAGE="connectmoda-backend"
TARGET_VERSION="${1:-}"
COMPOSE_FILE="/opt/connectmoda/docker-compose.production.yml"
REPO="${GITHUB_REPOSITORY:-tu-usuario/tu-repo}"

echo "⏪ ConnectModa — Rollback manual"
echo "================================"

# ─── Verificar versión objetivo ───────────────────────────────────────────────
if [ -z "$TARGET_VERSION" ]; then
  echo "Uso: bash rollback.sh <version>"
  echo "Ejemplo: bash rollback.sh v1.1.0"
  echo ""
  echo "Versiones disponibles en el registro:"
  docker images "${REGISTRY}/${REPO}/${IMAGE}" --format "{{.Tag}}\t{{.CreatedAt}}" | head -10
  exit 1
fi

FULL_IMAGE="${REGISTRY}/${REPO}/${IMAGE}:${TARGET_VERSION}"

echo "Versión actual:"
CURRENT=$(docker inspect connectmoda-prod-app --format='{{.Config.Image}}' 2>/dev/null || echo "desconocida")
echo "  $CURRENT"
echo ""
echo "Versión objetivo:"
echo "  $FULL_IMAGE"
echo ""

read -p "¿Confirmar rollback? (s/N) " CONFIRM
if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
  echo "Rollback cancelado."
  exit 0
fi

# ─── Guardar imagen actual como backup ────────────────────────────────────────
echo "$CURRENT" > /opt/connectmoda/.rollback_backup
echo "Backup guardado: $CURRENT"

# ─── Pull de la versión objetivo ──────────────────────────────────────────────
echo "Descargando imagen $FULL_IMAGE ..."
docker pull "$FULL_IMAGE"

# ─── Actualizar docker-compose para usar la versión objetivo ─────────────────
cd /opt/connectmoda
sed -i "s|image: .*connectmoda-backend:.*|image: ${FULL_IMAGE}|g" "$COMPOSE_FILE"

# ─── Recrear el contenedor de la app ─────────────────────────────────────────
echo "Recreando contenedor..."
docker-compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate app

# ─── Verificar que el contenedor levantó ─────────────────────────────────────
echo "Esperando 20 segundos..."
sleep 20

for i in 1 2 3; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health || echo "000")
  echo "Intento $i: HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "✅ Rollback exitoso a $TARGET_VERSION"
    docker image prune -f
    exit 0
  fi
  sleep 10
done

echo "❌ Rollback FALLÓ — la app no responde"
echo "   Restaurando imagen anterior: $CURRENT"
sed -i "s|image: .*connectmoda-backend:.*|image: ${CURRENT}|g" "$COMPOSE_FILE"
docker-compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate app
exit 1

#!/bin/bash
# scripts/scaling/scale.sh
# Escalar instancias de ConnectModa manualmente (Docker Compose o Kubernetes)
# Uso: bash scale.sh [up|down|status] [replicas]
# Ejemplo: bash scale.sh up 5

set -euo pipefail

ACTION="${1:-status}"
REPLICAS="${2:-3}"
COMPOSE_FILE="/opt/connectmoda/docker-compose.scale.yml"
K8S_NAMESPACE="connectmoda"
K8S_DEPLOYMENT="connectmoda-api"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ─── Detectar entorno ─────────────────────────────────────────────────────────
detect_env() {
  if command -v kubectl &>/dev/null && kubectl get namespace "$K8S_NAMESPACE" &>/dev/null 2>&1; then
    echo "kubernetes"
  elif command -v docker-compose &>/dev/null && [ -f "$COMPOSE_FILE" ]; then
    echo "docker-compose"
  else
    echo "unknown"
  fi
}

ENV=$(detect_env)
log "Entorno detectado: $ENV"

# ─── STATUS ──────────────────────────────────────────────────────────────────
show_status() {
  if [ "$ENV" = "kubernetes" ]; then
    log "=== Estado Kubernetes ==="
    kubectl get pods -n "$K8S_NAMESPACE" -l component=api \
      -o custom-columns="POD:metadata.name,STATUS:status.phase,READY:status.containerStatuses[0].ready,NODE:spec.nodeName"
    echo ""
    kubectl get hpa -n "$K8S_NAMESPACE"
  elif [ "$ENV" = "docker-compose" ]; then
    log "=== Estado Docker Compose ==="
    docker-compose -f "$COMPOSE_FILE" ps app-1 app-2 app-3 app-4 app-5 2>/dev/null || true
    echo ""
    log "Instancias activas:"
    docker ps --filter "name=connectmoda-app" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  fi
}

# ─── SCALE UP ────────────────────────────────────────────────────────────────
scale_up() {
  log "⬆️  Escalando a $REPLICAS réplicas..."

  if [ "$ENV" = "kubernetes" ]; then
    CURRENT=$(kubectl get deployment "$K8S_DEPLOYMENT" -n "$K8S_NAMESPACE" \
      -o jsonpath='{.spec.replicas}')
    log "Réplicas actuales: $CURRENT → $REPLICAS"

    kubectl scale deployment "$K8S_DEPLOYMENT" \
      -n "$K8S_NAMESPACE" \
      --replicas="$REPLICAS"

    log "Esperando que los pods estén listos..."
    kubectl rollout status deployment/"$K8S_DEPLOYMENT" \
      -n "$K8S_NAMESPACE" \
      --timeout=120s

    log "✅ Escalado a $REPLICAS réplicas completado"

  elif [ "$ENV" = "docker-compose" ]; then
    # En Docker Compose escalar el servicio app
    # Nota: requiere que el compose use 'app' como servicio escalable
    docker-compose -f "$COMPOSE_FILE" up -d --scale app="$REPLICAS" --no-recreate
    log "✅ Docker Compose escalado a $REPLICAS instancias"
  fi
}

# ─── SCALE DOWN ──────────────────────────────────────────────────────────────
scale_down() {
  MIN_REPLICAS=2
  if [ "$REPLICAS" -lt "$MIN_REPLICAS" ]; then
    log "⚠️  Mínimo $MIN_REPLICAS réplicas requeridas. Ajustando a $MIN_REPLICAS."
    REPLICAS=$MIN_REPLICAS
  fi

  log "⬇️  Reduciendo a $REPLICAS réplicas..."

  if [ "$ENV" = "kubernetes" ]; then
    kubectl scale deployment "$K8S_DEPLOYMENT" \
      -n "$K8S_NAMESPACE" \
      --replicas="$REPLICAS"
    kubectl rollout status deployment/"$K8S_DEPLOYMENT" -n "$K8S_NAMESPACE" --timeout=60s
    log "✅ Reducido a $REPLICAS réplicas"
  elif [ "$ENV" = "docker-compose" ]; then
    docker-compose -f "$COMPOSE_FILE" up -d --scale app="$REPLICAS" --no-recreate
    log "✅ Docker Compose reducido a $REPLICAS instancias"
  fi
}

# ─── BLUE-GREEN DEPLOY ────────────────────────────────────────────────────────
blue_green() {
  IMAGE="${3:-production-latest}"
  log "🔵🟢 Blue-Green deploy con imagen: $IMAGE"

  if [ "$ENV" = "kubernetes" ]; then
    # Actualizar imagen → Kubernetes hace rolling update automático
    kubectl set image deployment/"$K8S_DEPLOYMENT" \
      api="ghcr.io/TU_ORG/connectmoda-backend:$IMAGE" \
      -n "$K8S_NAMESPACE"

    kubectl rollout status deployment/"$K8S_DEPLOYMENT" \
      -n "$K8S_NAMESPACE" \
      --timeout=300s

    if [ $? -eq 0 ]; then
      log "✅ Blue-green deploy exitoso"
    else
      log "❌ Deploy falló — haciendo rollback"
      kubectl rollout undo deployment/"$K8S_DEPLOYMENT" -n "$K8S_NAMESPACE"
      exit 1
    fi
  fi
}

# ─── MAIN ────────────────────────────────────────────────────────────────────
case "$ACTION" in
  up)       scale_up ;;
  down)     scale_down ;;
  status)   show_status ;;
  deploy)   blue_green "$@" ;;
  *)
    echo "Uso: $0 [up|down|status|deploy] [replicas] [image_tag]"
    echo "Ejemplos:"
    echo "  $0 status"
    echo "  $0 up 5"
    echo "  $0 down 2"
    echo "  $0 deploy 3 v1.2.0"
    exit 1
    ;;
esac

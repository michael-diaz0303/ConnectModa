# GitHub Actions — Secrets y Variables requeridas
# Configurar en: Settings → Secrets and variables → Actions

## ═══════════════════════════════════════════════
##  SECRETS (valores sensibles — nunca en el repo)
## ═══════════════════════════════════════════════

### ── Tests ─────────────────────────────────────
# JWT_SECRET_TEST          → Secreto JWT para el entorno de tests
# STRIPE_TEST_KEY          → sk_test_XXXX (clave de test de Stripe)

### ── Docker / Registry ─────────────────────────
# GITHUB_TOKEN             → Auto-generado por GitHub (no configurar manualmente)

### ── Staging ───────────────────────────────────
# RAILWAY_TOKEN            → Token de Railway (si usas Railway)
# RENDER_API_KEY           → API key de Render (si usas Render)
# RENDER_STAGING_SERVICE_ID → ID del servicio staging en Render
# STAGING_HOST             → IP o dominio del servidor de staging
# STAGING_USER             → Usuario SSH del servidor staging
# STAGING_SSH_KEY          → Clave SSH privada para el servidor staging

### ── Producción ────────────────────────────────
# RENDER_PROD_SERVICE_ID   → ID del servicio producción en Render
# PROD_HOST                → IP o dominio del servidor de producción
# PROD_USER                → Usuario SSH del servidor producción
# PROD_SSH_KEY             → Clave SSH privada del servidor producción

### ── Monitoring ────────────────────────────────
# SNYK_TOKEN               → Token de Snyk para security scanning
# CODECOV_TOKEN            → Token de Codecov para reporte de cobertura
# SLACK_WEBHOOK_URL        → Webhook URL de Slack para notificaciones

## ═══════════════════════════════════════════════
##  VARIABLES (valores no sensibles)
## ═══════════════════════════════════════════════
# STAGING_URL              → https://connectmoda-staging.up.railway.app
# PRODUCTION_URL           → https://connectmoda.co
# DEPLOY_TARGET            → railway | render | vps

## ═══════════════════════════════════════════════
##  ENVIRONMENTS (GitHub Environments)
## ═══════════════════════════════════════════════
# Crear dos environments en Settings → Environments:
#
# 1. staging
#    - No requiere aprobación manual
#    - URL: https://connectmoda-staging.up.railway.app
#
# 2. production
#    - Requiere aprobación de 1 reviewer antes del deploy
#    - URL: https://connectmoda.co
#    - Deployment branches: only 'main' and tags matching v*.*.*

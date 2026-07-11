# ConnectModa — CI/CD Pipeline

Pipeline completo de integración y despliegue continuo para el backend de ConnectModa.

---

## Arquitectura del pipeline

```
push a develop ──→ Tests → Build Docker → Deploy Staging → Smoke Tests
                                                                  │
                                                          ✅ OK → Notificación
                                                          ❌ FAIL → Notificación

tag vX.Y.Z ──────→ Tests → Build Docker → Deploy Producción → Smoke Tests
(o manual)                                                          │
                                                          ✅ OK → Audit log
                                                          ❌ FAIL → Rollback automático
```

---

## Archivos incluidos

```
.
├── .github/
│   ├── workflows/
│   │   ├── test.yml                  # Tests en cada push/PR
│   │   ├── deploy-staging.yml        # Deploy automático a staging
│   │   └── deploy-production.yml     # Deploy a producción (manual/tag)
│   └── SECRETS.md                    # Lista de secrets requeridos
│
├── docker/
│   ├── Dockerfile                    # Multi-stage build optimizado
│   ├── mongo-init.js                 # Inicialización de MongoDB
│   └── redis.conf                    # Configuración Redis
│
├── config/
│   ├── environments/
│   │   ├── .env.development          # Variables de desarrollo
│   │   └── .env.staging              # Variables de staging
│   └── nginx/
│       ├── nginx.dev.conf            # Nginx para desarrollo
│       └── nginx.prod.conf           # Nginx con SSL para producción
│
├── scripts/
│   ├── setup-server.sh               # Setup inicial de VPS
│   └── rollback.sh                   # Rollback manual
│
├── src/
│   ├── config/sentry.js              # Error tracking con Sentry
│   ├── routes/healthRoutes.js        # Health checks
│   ├── server.js                     # Servidor con middleware completo
│   └── utils/logger.js               # Logger con Winston
│
├── docker-compose.yml                # Desarrollo local
├── docker-compose.staging.yml        # Staging
├── docker-compose.production.yml     # Producción
├── .eslintrc.json                    # Reglas ESLint
├── .prettierrc                       # Formateo
├── .husky/
│   ├── pre-commit                    # Lint + format antes del commit
│   ├── pre-push                      # Tests antes del push
│   └── commit-msg                    # Validar Conventional Commits
└── package.json                      # Scripts completos
```

---

## Setup inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp config/environments/.env.development .env
# Editar .env con tus valores
```

### 3. Instalar hooks de Git (Husky)

```bash
npm run prepare
```

### 4. Levantar el entorno local con Docker

```bash
docker-compose up -d
```

Para incluir Nginx y la UI de MongoDB:

```bash
docker-compose --profile with-nginx --profile with-ui up -d
```

---

## Configurar GitHub Actions

Ver `.github/SECRETS.md` para la lista completa de secrets.

**Secrets mínimos para que funcione:**
- `JWT_SECRET_TEST` → cualquier string largo
- `STRIPE_TEST_KEY` → `sk_test_fake` (para tests)
- `RAILWAY_TOKEN` o `RENDER_API_KEY` → según tu proveedor
- `SLACK_WEBHOOK_URL` → opcional, para notificaciones

**Variables (no secrets):**
- `STAGING_URL` → URL de tu staging
- `PRODUCTION_URL` → URL de producción
- `DEPLOY_TARGET` → `railway`, `render`, o `vps`

---

## Hacer un deploy

### Deploy a staging (automático)

```bash
git push origin develop
# GitHub Actions corre tests + deploy automáticamente
```

### Deploy a producción (tag)

```bash
git tag v1.2.0
git push origin v1.2.0
# GitHub crea un release → dispara el workflow de producción
```

### Deploy a producción (manual)

En GitHub → Actions → "Deploy Production" → "Run workflow" → ingresar versión + escribir `DEPLOY`.

---

## Rollback

### Automático

Si los smoke tests fallan después del deploy, el rollback se ejecuta automáticamente.

### Manual

```bash
# En el servidor de producción:
bash /opt/connectmoda/scripts/rollback.sh v1.1.0
```

---

## Monitoreo

| Servicio | URL | Notas |
|----------|-----|-------|
| Health check | `GET /api/health` | Público, sin auth |
| Health detallado | `GET /api/health/detailed` | Requiere `x-internal-key` |
| Versión | `GET /api/version` | Para smoke tests y rollback |
| Sentry | dashboard.sentry.io | Error tracking staging + prod |
| Logs | `docker-compose logs -f app` | o `logs/app.log` en VPS |

---

## Scripts disponibles

```bash
npm run lint              # ESLint
npm run lint:fix          # ESLint con auto-fix
npm run format            # Prettier
npm run format:check      # Verificar formato sin cambiar

npm test                  # Todos los tests
npm run test:unit         # Solo unit tests
npm run test:integration  # Solo integration tests
npm run test:e2e          # Solo E2E tests
npm run test:watch        # Modo watch
npm run test:coverage     # Con reporte de cobertura

npm run docker:build      # Build imagen local
npm run docker:run        # docker-compose up -d
npm run docker:stop       # docker-compose down
npm run docker:logs       # Ver logs de la app
npm run docker:clean      # Limpiar todo (incluye volúmenes)

npm run audit             # npm audit --audit-level=moderate
```

---

## Conventional Commits

Este proyecto usa [Conventional Commits](https://www.conventionalcommits.org/).

```
feat(auth): agregar login con Google OAuth
fix(orden): corregir cálculo de total con descuento
docs(readme): actualizar instrucciones de deploy
test(productos): agregar tests E2E de búsqueda
ci: agregar step de security scan con Snyk
chore(deps): actualizar Stripe a v13
```

El hook `commit-msg` valida el formato automáticamente.

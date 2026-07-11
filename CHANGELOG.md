# Changelog

Todos los cambios notables del proyecto ConnectModa se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versiones siguiendo [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

### Added
- Búsqueda de negocios/talleres (`GET /api/buscar/negocios`) con filtros por ciudad, categoría y valoración
- `CHANGELOG.md` para seguimiento de versiones (este archivo)
- Frontend: módulo `ConnectModa.iniciarCheckoutWompi()` en `main.js` con widget Wompi, confirmación y manejo de redirección
- Frontend: `ConnectModa.cargarBancosPSE()` para poblar selector de bancos en formularios PSE

---

## [3.0.0] - 2025-06-09

### Changed — Migración Stripe → Wompi
- Reemplazado `utils/stripe.js` por `utils/wompi.js` con soporte nativo para PSE, Nequi, Tarjeta y Bancolombia Transfer
- Reescrito `controllers/pagoController.js` con flujo completo de Wompi (iniciar, confirmar, recibo PDF, bancos PSE)
- Reescrito `routes/webhooks.js` para eventos Wompi (`transaction.updated`) con verificación de firma SHA256
- Actualizado `models/Transaccion.js`: eliminados campos de Stripe, agregados `referencia`, `wompiTransactionId`, `montoCentavos`
- Wompi usa `fetch` nativo de Node 18 — eliminada dependencia `stripe` del `package.json`
- Reemplazado `stripe.service.test.js` por `wompi.service.test.js`

### Fixed — Errores críticos
- `server.js` ahora usa `routes/index.js` correctamente (antes las rutas no estaban montadas)
- `middleware/auth.js` convierte `payload.id` a `ObjectId` de Mongoose para evitar fallos en `populate()`

### Added
- `middleware/auth.js`: nuevos helpers `soloRol()`, `soloVerificado`, `soloPropio()`, `opcional`
- `controllers/resenaController.js`: CRUD completo con moderación, cálculo de promedio y distribución de calificaciones
- `routes/resenas.js`: endpoints para crear, listar, moderar y eliminar reseñas
- `controllers/authController.js`: verificación de email, reenvío, forgot/reset password, logout con rotación de refresh token
- `routes/auth.js`: nuevas rutas `/verificar-email`, `/forgot-password`, `/reset-password`, `/logout`, `/reenviar-verificacion`
- `models/Negocio.js`: campo `propietario` (referencia a `Usuario`) con índice compuesto

### Fixed — iaService.js
- Cada proveedor de IA usa su propia variable de entorno (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`)

---

## [2.0.0] - 2025-05-01

### Added — Infraestructura de escalabilidad
- Kubernetes: deployments para API, worker e ingress gateway con overlays de staging y producción (Kustomize)
- Monitoring: Prometheus + Grafana + Alertmanager + reglas de alerta
- `backend/services/`: `cacheService`, `metricsService`, `queueService`
- `backend/worker.js`: worker independiente para procesamiento de colas
- Docker: Redis Sentinel, MongoDB Replica Set, RabbitMQ
- `docker-compose.scale.yml` para entorno multi-instancia
- Scripts de load testing, escalado automático y backups de MongoDB

### Added — CI/CD
- GitHub Actions: pipeline de tests, deploy a staging y deploy a producción
- Git hooks con Husky: pre-commit (lint), pre-push (tests), commit-msg (formato conventional)
- Docker + docker-compose para dev, staging y producción
- Nginx configurado para dev, prod y upstream con load balancer
- `routes/healthRoutes.js` y `config/sentry.js` integrados al backend
- ESLint + Prettier

### Added — Suite de tests
- Jest configurado en `backend/package.json` (un solo `npm install`)
- Unit tests: `authController`, `ordenController`, `productoController`, modelos, utils
- Integration tests: rutas de auth y productos, servicio de Wompi
- E2E: flujo completo de compra
- Fixtures, mocks y setup global

---

## [1.0.0] - 2025-03-15

### Added — Backend inicial
- API REST con Node.js, Express y MongoDB
- 10 módulos: búsqueda avanzada, gestión de órdenes, pagos, Socket.io, Redis, IA, Bull queues, AWS S3, analytics, microservicios
- Autenticación JWT con roles (comprador, emprendedor, admin)
- 8 modelos Mongoose: Usuario, Negocio, Producto, Orden, Transaccion, Resena, Analytics, RecomendacionIA
- Integración multi-proveedor de IA (OpenAI, Claude, Gemini, Ollama)
- Storage configurable: AWS S3, Cloudinary o local

### Added — Frontend
- Landing page con HTML5, CSS3, JavaScript vanilla
- Dashboard de la plataforma
- Diseño responsive mobile-first

---

## Guía de formato de commits

Este proyecto usa [Conventional Commits](https://www.conventionalcommits.org/es/):

```
<tipo>[alcance opcional]: <descripción>

tipos: feat | fix | docs | style | refactor | test | chore | perf | ci
```

**Ejemplos:**
```
feat(auth): agregar verificación de email con token
fix(pagos): corregir cálculo de centavos en Wompi
refactor(search): separar búsqueda de productos y negocios
test(resenas): agregar tests de moderación
chore(deps): actualizar mongoose a 8.4.1
docs(api): documentar endpoints de reseñas
```

El hook `commit-msg` de Husky valida automáticamente este formato.

---

[Unreleased]: https://github.com/tu-usuario/connectModa/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/tu-usuario/connectModa/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/tu-usuario/connectModa/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/tu-usuario/connectModa/releases/tag/v1.0.0

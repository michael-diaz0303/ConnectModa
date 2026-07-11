# ConnectModa — Plan de Escalabilidad

## Resumen ejecutivo

ConnectModa escala en 3 fases según el volumen de usuarios, con arquitectura stateless desde el inicio para facilitar el escalado horizontal sin refactorizaciones costosas.

---

## SLOs (Service Level Objectives)

| Métrica | Objetivo | Alerta |
|---------|----------|--------|
| Disponibilidad | ≥ 99.5% mensual | < 99.5% → crítico |
| Latencia p95 | < 500ms | > 500ms por 3min → warning |
| Latencia p99 | < 2s | > 2s → warning |
| Tasa de errores 5xx | < 0.5% | > 0.5% por 2min → crítico |
| Tiempo de recuperación (MTTR) | < 15 min | — |
| RPO (pérdida máx. de datos) | < 1 hora | — |

---

## Arquitectura por fase

### FASE 1 — 0 a 10.000 usuarios (~$20-40 USD/mes)

**Cuándo aplicar:** desde el lanzamiento hasta ~10K usuarios activos mensuales.

**Stack:**
```
Internet → [Railway/Render] → Node.js (1 instancia) → MongoDB Atlas M0 → Redis Upstash
```

**Decisiones clave:**
- Un solo servidor con Node.js y MongoDB Atlas (tier gratuito M0)
- Redis en Upstash (tier gratuito — 10K solicitudes/día)
- Sin load balancer (no necesario con 1 instancia)
- CI/CD ya configurado para escalar fácilmente

**Recursos en Railway/Render:**
- App: 512MB RAM, 0.5 vCPU — ~$10/mes
- MongoDB Atlas M0: Gratis (512MB)
- Redis Upstash: Gratis hasta 10K req/día
- Total estimado: **$10-20/mes**

**Limitaciones y señales para escalar:**
- CPU sostenida > 70% durante 30+ minutos
- RAM > 80% de forma constante
- Latencia p95 superando 400ms
- Errores 503 por falta de conexiones

---

### FASE 2 — 10.000 a 100.000 usuarios (~$100-250 USD/mes)

**Cuándo aplicar:** cuando la Fase 1 muestre señales de saturación.

**Stack:**
```
Internet
   ↓
[Nginx Load Balancer]
   ↓ (least_conn)
[App-1] [App-2] [App-3]   ← 3 instancias Node.js stateless
   ↓
[MongoDB Replica Set]      ← 1 primary + 2 secondary
[Redis Master + 2 Replicas + Sentinel]
[RabbitMQ]                 ← Cola para emails y notificaciones
   ↓
[Worker-1] [Worker-2]      ← Procesos separados para tareas asíncronas
```

**Decisiones clave:**
- 3 instancias de la app (Docker Compose o 3 VPS)
- MongoDB Replica Set para alta disponibilidad y lecturas distribuidas
- Redis con replicación y Sentinel para failover automático
- RabbitMQ para desacoplar envío de emails y notificaciones
- Workers separados para no bloquear la API
- Nginx como LB con health checks y caché de GETs públicos

**Costos estimados (Railway/Render):**
- 3 instancias app (1GB RAM c/u): ~$60/mes
- MongoDB Atlas M10: $57/mes
- Redis Cloud 100MB: $7/mes
- RabbitMQ (CloudAMQP): $19/mes
- Nginx LB: ~$10/mes
- Total estimado: **$150-200/mes**

---

### FASE 3 — 100.000 a 1.000.000+ usuarios (~$500-2000+ USD/mes)

**Cuándo aplicar:** cuando la Fase 2 no pueda absorber el crecimiento incluso con más instancias.

**Stack:**
```
CloudFlare CDN (assets + DDoS protection)
   ↓
[Kubernetes Ingress]
   ↓
[API Pods: 3-10 réplicas, HPA automático]
[Worker Pods: 2-8 réplicas, HPA por cola]
   ↓
[MongoDB Atlas M30+ con sharding]
[Redis Cluster (6 nodos)]
[RabbitMQ Cluster (3 brokers)]
   ↓
[Prometheus + Grafana + Alertmanager]
[Sentry]
[S3/R2 para uploads]
```

**Decisiones clave:**
- Kubernetes con HPA (escala automático por CPU, RAM o métricas custom)
- MongoDB Atlas M30+ con sharding por `usuario_id` para distribución de carga
- Redis Cluster (6 nodos: 3 masters + 3 replicas) para alta disponibilidad
- CDN (CloudFlare) para assets estáticos — reduce carga del servidor ~60%
- PodDisruptionBudget garantiza mínimo 2 pods durante mantenimiento
- Blue-green deployments con `kubectl rollout` y rollback automático

**Costos estimados:**
- Kubernetes cluster (3 nodos 4CPU/8GB): ~$200/mes
- MongoDB Atlas M30: ~$190/mes
- Redis Enterprise: ~$80/mes
- CloudFlare Pro: $20/mes
- Monitoring stack: incluido
- Total estimado: **$500-700/mes base**

---

## Decisiones de arquitectura stateless

Para que el escalado horizontal funcione, **la app no debe guardar estado local**:

| Estado | Solución |
|--------|----------|
| Sesiones de usuario | JWT stateless + blacklist en Redis |
| Caché | Redis (compartido entre instancias) |
| Archivos subidos | S3/Cloudinary (no disco local) |
| Colas de trabajo | RabbitMQ (externo) |
| Rate limiting | Redis (distribuido) |
| WebSocket | Sticky sessions en Nginx (`ip_hash`) |

---

## CDN — CloudFlare

**Qué se cachea en el edge:**
```
/uploads/*              → 30 días (imágenes de productos)
/api/productos          → 2 minutos (con Vary: Authorization)
Assets estáticos (JS/CSS/fonts) → 1 año (inmutable)
```

**Configuración de Cache Rules en CloudFlare:**
1. `connectmoda.co/uploads/*` → Cache Everything, TTL 30d
2. `connectmoda.co/api/productos*` (sin Authorization) → Cache, TTL 2min
3. Todo lo demás → Bypass (respeta headers del servidor)

**DDoS Protection:**
- CloudFlare activa protección automática en Layer 3/4/7
- Rate limiting adicional en Layer 7 (100 req/10s por IP)
- Bot management incluido en plan Pro

---

## Sharding MongoDB (Fase 3)

```javascript
// Shard key por taller_id — distribución uniforme
sh.enableSharding("connectmoda")

// Colección de productos: shard por taller
sh.shardCollection("connectmoda.productos", { taller: "hashed" })

// Colección de órdenes: shard por empresa
sh.shardCollection("connectmoda.ordenes", { empresa: "hashed" })

// Usuarios: sin shard (colección pequeña)
```

**Por qué `hashed` y no range:**
- Distribución uniforme de datos entre shards
- Evita hot spots cuando un taller tiene muchos productos
- Las queries por `taller_id` van directo al shard correcto (no scatter-gather)

---

## Backups y recuperación

| Frecuencia | Método | Retención | Destino |
|------------|--------|-----------|---------|
| Cada hora | MongoDB oplog | 24h | En memoria del replica set |
| Cada día (02:00 AM) | mongodump + gzip | 7 días local / 30 días S3 | S3/R2 |
| Semanal | Snapshot completo | 90 días | S3 Glacier (económico) |

**RTO (Recovery Time Objective):** < 15 minutos con replica set activo.
**RPO (Recovery Point Objective):** < 1 hora con backups diarios.

**Cron para backups:**
```bash
# /etc/cron.d/connectmoda-backup
0 2 * * * root /opt/connectmoda/scripts/backup/mongo-backup.sh >> /var/log/backup.log 2>&1
```

---

## Plan de contingencia

### Escenario 1: Instancia de app caída
- Nginx detecta la falla (health check cada 10s)
- Redirige automáticamente a las instancias sanas
- Si queda 1 instancia: alerta crítica en Slack
- **Impacto:** 0 (si quedan ≥2 instancias sanas)

### Escenario 2: MongoDB primary caído
- Replica set elige nuevo primary en <30 segundos
- Escrituras fallan durante la elección (~10-30s)
- App implementa retry automático con backoff exponencial
- **Impacto:** ~30 segundos de errores en escrituras

### Escenario 3: Redis master caído
- Sentinel detecta la falla en <10 segundos
- Promueve una replica a master automáticamente
- **Impacto:** ~10-15 segundos de caché no disponible, app funciona sin caché (degraded mode)

### Escenario 4: RabbitMQ caído
- Emails y notificaciones se encolan en memoria temporalmente
- Al recuperarse, se procesan los mensajes pendientes
- **Impacto:** retraso en notificaciones, 0 impacto en la API principal

### Escenario 5: DDoS
- CloudFlare absorbe el ataque en el edge (Fase 3)
- Nginx rate limiting bloquea IPs abusivas (Fase 2)
- Script de auto-blacklist: `fail2ban` para IPs que superen 1000 req/min
- **Impacto:** mínimo si CloudFlare está activo

---

## Checklist de escalado (de Fase 1 a Fase 2)

- [ ] Configurar MongoDB Atlas M10 (o Replica Set propio)
- [ ] Mover Redis a servidor dedicado con replicación
- [ ] Instalar y configurar Nginx LB (`nginx/conf.d/upstream.conf`)
- [ ] Levantar instancias adicionales con `docker-compose.scale.yml`
- [ ] Configurar RabbitMQ y mover lógica de emails al worker
- [ ] Verificar que la app sea 100% stateless (sin sesiones locales)
- [ ] Configurar Prometheus + Grafana
- [ ] Configurar alertas en Alertmanager
- [ ] Verificar backups automáticos
- [ ] Hacer prueba de carga con k6 o Artillery
- [ ] Documentar el runbook de incidentes

---

## Prueba de carga recomendada antes de cada fase

```bash
# Instalar k6: https://k6.io/docs/getting-started/installation/
k6 run scripts/load-test.js

# Objetivos por fase:
# Fase 1: soportar 50 usuarios concurrentes, < 200ms p95
# Fase 2: soportar 500 usuarios concurrentes, < 400ms p95
# Fase 3: soportar 5000 usuarios concurrentes, < 500ms p95
```

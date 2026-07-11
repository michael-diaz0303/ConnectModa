# ConnectModa — Escalabilidad Horizontal

Infraestructura y configuración para escalar ConnectModa de 0 a 1M+ usuarios.

---

## Estructura

```
connectmoda-scale/
├── nginx/
│   └── conf.d/
│       └── upstream.conf          # LB: upstream, rate limiting, caché, SSL
│
├── docker/
│   ├── mongo/
│   │   └── init-replica.js        # Inicializar replica set + índices
│   ├── redis/
│   │   ├── redis-master.conf      # Config Redis master
│   │   └── sentinel.conf          # Sentinel para failover automático
│   └── rabbitmq/
│       └── definitions.json       # Colas, exchanges y bindings
│
├── docker-compose.scale.yml       # Stack completo Fase 2
│
├── kubernetes/
│   ├── base/
│   │   └── namespace-config.yml   # Namespace, ConfigMap, Secrets
│   └── apps/
│       ├── api/
│       │   └── deployment.yml     # Deployment + Service + HPA + PDB
│       ├── worker/
│       │   └── deployment.yml     # Worker + HPA por profundidad de cola
│       └── gateway/
│           └── ingress.yml        # Ingress + PersistentVolumes
│
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml         # Scrape configs
│   │   └── rules/
│   │       └── alerts.rules.yml   # Alertas API + Infra + Negocio
│   ├── alertmanager/
│   │   └── alertmanager.yml       # Routing Slack + email + PagerDuty
│   └── grafana/
│       ├── dashboards/
│       │   └── api-overview.json  # Dashboard principal con SLOs
│       └── provisioning/          # Auto-provisioning de Grafana
│
├── src/
│   ├── services/
│   │   ├── queue/
│   │   │   └── queueService.js    # RabbitMQ: publish + consume + retry
│   │   ├── cache/
│   │   │   └── cacheService.js    # Redis: cache-aside, sessions, rate limit
│   │   └── metrics/
│   │       └── metricsService.js  # Prometheus: middleware + métricas negocio
│   └── worker.js                  # Proceso worker: emails, órdenes, pagos
│
├── scripts/
│   ├── backup/
│   │   └── mongo-backup.sh        # Backup diario con rotación + S3
│   └── scaling/
│       ├── scale.sh               # Escalar instancias (K8s o Docker)
│       └── load-test.js           # Prueba de carga con k6
│
└── docs/
    └── ESCALABILIDAD.md           # Plan por fases, SLOs, costos, contingencia
```

---

## Inicio rápido — Fase 2 (Docker Compose)

```bash
# 1. Copiar variables de entorno
cp config/environments/.env.production .env.production
# Editar .env.production con tus valores

# 2. Crear keyfile para MongoDB Replica Set
openssl rand -base64 756 > docker/mongo/keyfile
chmod 400 docker/mongo/keyfile

# 3. Levantar toda la infraestructura
docker-compose -f docker-compose.scale.yml up -d

# 4. Inicializar el Replica Set (solo la primera vez)
docker exec connectmoda-mongo-primary mongosh --eval "load('/docker-entrypoint-initdb.d/init.js')"

# 5. Verificar estado
bash scripts/scaling/scale.sh status

# 6. Ver dashboards
# Grafana:    http://localhost:3001  (admin / $GRAFANA_PASSWORD)
# Prometheus: http://localhost:9090
# RabbitMQ:   http://localhost:15672 (connectmoda / $RABBITMQ_PASS)
```

---

## Inicio rápido — Fase 3 (Kubernetes)

```bash
# 1. Configurar cluster (EKS, GKE, DigitalOcean DOKS, etc.)
kubectl cluster-info

# 2. Aplicar manifiestos base
kubectl apply -f kubernetes/base/namespace-config.yml

# 3. Configurar secrets reales (reemplazar valores en namespace-config.yml primero)
kubectl apply -f kubernetes/base/namespace-config.yml

# 4. Deploy API
kubectl apply -f kubernetes/apps/api/deployment.yml

# 5. Deploy Worker
kubectl apply -f kubernetes/apps/worker/deployment.yml

# 6. Configurar Ingress
kubectl apply -f kubernetes/apps/gateway/ingress.yml

# 7. Verificar
kubectl get pods -n connectmoda
kubectl get hpa -n connectmoda

# 8. Escalar manualmente
bash scripts/scaling/scale.sh up 5
```

---

## Prueba de carga

```bash
# Instalar k6
brew install k6  # macOS
# o: https://k6.io/docs/getting-started/installation/

# Prueba contra local
k6 run scripts/scaling/load-test.js

# Prueba contra staging
k6 run --env BASE_URL=https://connectmoda-staging.up.railway.app \
  scripts/scaling/load-test.js

# Con más usuarios
k6 run --vus 200 --duration 5m scripts/scaling/load-test.js
```

---

## Backups

```bash
# Configurar cron (ejecutar como root)
echo "0 2 * * * root MONGODB_URI='mongodb://...' SLACK_WEBHOOK_URL='https://...' /opt/connectmoda/scripts/backup/mongo-backup.sh" \
  > /etc/cron.d/connectmoda-backup

# Ejecutar backup manual
bash scripts/backup/mongo-backup.sh

# Restaurar backup
ARCHIVE="connectmoda_20241201_020000.tar.gz"
tar -xzf "$ARCHIVE"
mongorestore --uri="$MONGODB_URI" --gzip --drop connectmoda_20241201_020000/
```

---

## Fases y costos estimados

| Fase | Usuarios | Arquitectura | Costo/mes |
|------|----------|-------------|-----------|
| 1 | 0 – 10K | 1 server + MongoDB M0 + Redis free | $10-20 |
| 2 | 10K – 100K | 3 servers + LB + Replica Set + Redis HA + RabbitMQ | $150-250 |
| 3 | 100K – 1M+ | Kubernetes + HPA + Sharding + CDN + Multi-región | $500-2000+ |

Ver [`docs/ESCALABILIDAD.md`](docs/ESCALABILIDAD.md) para el plan completo con SLOs, decisiones de arquitectura y planes de contingencia.

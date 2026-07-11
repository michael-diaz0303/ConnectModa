// src/services/metrics/metricsService.js
// ConnectModa — Métricas de Prometheus expuestas en /api/metrics

const client = require('prom-client');

// ─── Registro global ─────────────────────────────────────────────────────────
const register = new client.Registry();

// Métricas por defecto del proceso Node.js (CPU, RAM, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'connectmoda_node_',
  labels: {
    app: 'connectmoda-api',
    env: process.env.NODE_ENV || 'development',
    instance: process.env.NODE_ID || 'app-1',
  },
});

// ─── HTTP Metrics ─────────────────────────────────────────────────────────────
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP recibidos',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de requests HTTP en segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Requests HTTP en curso actualmente',
  registers: [register],
});

// ─── Business Metrics ─────────────────────────────────────────────────────────
const ordersCreatedTotal = new client.Counter({
  name: 'connectmoda_orders_created_total',
  help: 'Total de órdenes creadas',
  labelNames: ['metodoPago'],
  registers: [register],
});

const paymentsTotal = new client.Counter({
  name: 'connectmoda_payments_total',
  help: 'Total de pagos procesados',
  labelNames: ['status', 'provider'],
  registers: [register],
});

const paymentsFailedTotal = new client.Counter({
  name: 'connectmoda_payments_failed_total',
  help: 'Total de pagos fallidos',
  labelNames: ['provider', 'reason'],
  registers: [register],
});

const activeUsers = new client.Gauge({
  name: 'connectmoda_active_users',
  help: 'Usuarios con sesión activa (en Redis)',
  registers: [register],
});

const productosActivos = new client.Gauge({
  name: 'connectmoda_productos_activos_total',
  help: 'Total de productos activos en la plataforma',
  registers: [register],
});

const talleresRegistrados = new client.Gauge({
  name: 'connectmoda_talleres_total',
  help: 'Total de talleres registrados',
  registers: [register],
});

const empresasRegistradas = new client.Gauge({
  name: 'connectmoda_empresas_total',
  help: 'Total de empresas registradas',
  registers: [register],
});

const revenueTotal = new client.Counter({
  name: 'connectmoda_revenue_cop_total',
  help: 'Revenue total procesado en COP (centavos)',
  registers: [register],
});

// ─── Cache Metrics ────────────────────────────────────────────────────────────
const cacheHitsTotal = new client.Counter({
  name: 'connectmoda_cache_hits_total',
  help: 'Total de hits en caché Redis',
  labelNames: ['namespace'],
  registers: [register],
});

const cacheMissesTotal = new client.Counter({
  name: 'connectmoda_cache_misses_total',
  help: 'Total de misses en caché Redis',
  labelNames: ['namespace'],
  registers: [register],
});

// ─── Queue Metrics ────────────────────────────────────────────────────────────
const queueMessagesPublished = new client.Counter({
  name: 'connectmoda_queue_messages_published_total',
  help: 'Mensajes publicados en RabbitMQ',
  labelNames: ['queue'],
  registers: [register],
});

const queueMessagesProcessed = new client.Counter({
  name: 'connectmoda_queue_messages_processed_total',
  help: 'Mensajes procesados de RabbitMQ',
  labelNames: ['queue', 'status'],
  registers: [register],
});

// ─── Middleware para Express ─────────────────────────────────────────────────
const metricsMiddleware = (req, res, next) => {
  // Normalizar rutas para evitar cardinalidad alta (ej: /api/productos/MONGOID)
  const normalizeRoute = (url) => {
    return url
      .replace(/\/[0-9a-f]{24}/gi, '/:id')  // MongoDB ObjectId
      .replace(/\/\d+/g, '/:num')            // números
      .split('?')[0];                         // quitar query params
  };

  const start = Date.now();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    const durationSec = (Date.now() - start) / 1000;
    const route = normalizeRoute(req.path);
    const labels = { method: req.method, route, status: res.statusCode };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);
    httpRequestsInFlight.dec();
  });

  next();
};

// ─── Endpoint /api/metrics ────────────────────────────────────────────────────
const metricsHandler = async (req, res) => {
  // Solo exponer a red interna
  const ip = req.ip || req.connection.remoteAddress || '';
  const isInternal =
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.') ||
    ip === '127.0.0.1' ||
    ip === '::1';

  if (process.env.NODE_ENV === 'production' && !isInternal) {
    return res.status(403).json({ success: false, mensaje: 'Acceso denegado' });
  }

  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
};

module.exports = {
  metricsMiddleware,
  metricsHandler,
  metrics: {
    httpRequestsTotal,
    httpRequestDuration,
    ordersCreatedTotal,
    paymentsTotal,
    paymentsFailedTotal,
    activeUsers,
    productosActivos,
    talleresRegistrados,
    empresasRegistradas,
    revenueTotal,
    cacheHitsTotal,
    cacheMissesTotal,
    queueMessagesPublished,
    queueMessagesProcessed,
  },
};

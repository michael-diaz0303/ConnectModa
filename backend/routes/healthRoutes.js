// src/routes/healthRoutes.js
// Health check endpoints para monitoreo y CI/CD smoke tests

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');

// ─── GET /api/health ─────────────────────────────────────────────────────────
// Health check básico — usado por Docker HEALTHCHECK, Nginx y smoke tests
router.get('/', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  const healthy = dbState === 1;

  const status = {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV,
    services: {
      database: {
        status: dbStatus,
        healthy: dbState === 1,
      },
    },
  };

  return res.status(healthy ? 200 : 503).json(status);
});

// ─── GET /api/health/detailed ─────────────────────────────────────────────────
// Health check detallado — para monitoreo interno (no exponer públicamente)
router.get('/detailed', async (req, res) => {
  // Verificar auth interna (solo para uso interno/CI)
  const internalKey = req.headers['x-internal-key'];
  if (process.env.NODE_ENV === 'production' && internalKey !== process.env.INTERNAL_HEALTH_KEY) {
    return res.status(403).json({ success: false, mensaje: 'No autorizado' });
  }

  const dbState = mongoose.connection.readyState;
  let dbPingMs = null;

  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    dbPingMs = Date.now() - start;
  } catch (err) {
    dbPingMs = -1;
  }

  // Verificar Redis si está configurado
  let redisStatus = 'not-configured';
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.disconnect();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'error';
    }
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    uptime: {
      seconds: Math.floor(process.uptime()),
      human: formatUptime(process.uptime()),
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      memoryUsage: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      },
    },
    system: {
      platform: os.platform(),
      cpus: os.cpus().length,
      loadAvg: os.loadavg(),
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
      totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    },
    services: {
      database: {
        status: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState],
        pingMs: dbPingMs,
        healthy: dbState === 1,
      },
      redis: {
        status: redisStatus,
        configured: !!process.env.REDIS_URL,
      },
      wompi: {
        configured: !!process.env.WOMPI_PRIVATE_KEY,
        sandbox: process.env.WOMPI_ENV === 'sandbox',
      },
      email: {
        configured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER),
      },
    },
  });
});

// ─── GET /api/version ────────────────────────────────────────────────────────
// Versión del deployment — usado en smoke tests y rollback
router.get('/version', (req, res) => {
  return res.status(200).json({
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    commit: process.env.GIT_SHA || 'unknown',
    buildDate: process.env.BUILD_DATE || 'unknown',
  });
});

// ─── Helper ──────────────────────────────────────────────────────────────────
const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

module.exports = router;

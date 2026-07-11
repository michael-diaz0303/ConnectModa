// src/services/cache/cacheService.js
// ConnectModa — Servicio de caché distribuido con Redis
// Estrategias: Cache-aside, Write-through, TTL por tipo de dato

const { createClient } = require('redis');
const logger = require('../../utils/logger');

// TTLs en segundos por tipo de dato
const TTL = {
  PRODUCTO: 5 * 60,         // 5 min — cambia con frecuencia moderada
  PRODUCTOS_LISTA: 2 * 60,  // 2 min — lista pública
  USUARIO_PERFIL: 15 * 60,  // 15 min — raramente cambia
  ORDEN: 1 * 60,            // 1 min — estado puede cambiar
  SESION: 7 * 24 * 60 * 60, // 7 días — tokens de sesión
  BUSQUEDA: 3 * 60,         // 3 min — resultados de búsqueda
  STATS: 60 * 60,           // 1 hora — estadísticas del dashboard
  RATE_LIMIT: 15 * 60,      // 15 min — ventana de rate limiting
};

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.prefix = 'connectmoda:';
  }

  async connect() {
    if (process.env.NODE_ENV === 'test') {
      // Mock en tests
      this.client = {
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
        expire: async () => 1,
        keys: async () => [],
        ping: async () => 'PONG',
        quit: async () => {},
        incr: async () => 1,
        zadd: async () => 1,
        zrange: async () => [],
      };
      this.isConnected = true;
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = createClient({
        url: redisUrl,
        password: process.env.REDIS_PASSWORD,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis: demasiados reintentos, abortando');
              return new Error('Too many retries');
            }
            return Math.min(retries * 100, 3000);
          },
          connectTimeout: 5000,
        },
      });

      this.client.on('error', (err) => logger.error('Redis error:', err.message));
      this.client.on('connect', () => logger.info('✅ Redis conectado'));
      this.client.on('reconnecting', () => logger.warn('Redis reconectando...'));

      await this.client.connect();
      this.isConnected = true;
    } catch (err) {
      logger.error('Error conectando Redis:', err.message);
      // No lanzar — la app funciona sin caché (degraded mode)
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  _key(namespace, id) {
    return `${this.prefix}${namespace}:${id}`;
  }

  // ─── Operaciones básicas ─────────────────────────────────────────────────

  async get(key) {
    if (!this.isConnected) return null;
    try {
      const val = await this.client.get(this.prefix + key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      logger.warn('Cache GET error:', err.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    if (!this.isConnected) return false;
    try {
      await this.client.set(
        this.prefix + key,
        JSON.stringify(value),
        { EX: ttlSeconds }
      );
      return true;
    } catch (err) {
      logger.warn('Cache SET error:', err.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected) return false;
    try {
      await this.client.del(this.prefix + key);
      return true;
    } catch (err) {
      logger.warn('Cache DEL error:', err.message);
      return false;
    }
  }

  async delPattern(pattern) {
    if (!this.isConnected) return false;
    try {
      const keys = await this.client.keys(this.prefix + pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map((k) => this.client.del(k)));
      }
      return true;
    } catch (err) {
      logger.warn('Cache DEL pattern error:', err.message);
      return false;
    }
  }

  // ─── Cache-aside pattern ─────────────────────────────────────────────────
  // Si está en caché devuelve el valor, si no ejecuta el fetcher y lo guarda

  async getOrFetch(key, fetchFn, ttlSeconds = 300) {
    const cached = await this.get(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  // ─── Helpers específicos de ConnectModa ──────────────────────────────────

  async getProducto(id) {
    return this.get(`producto:${id}`);
  }

  async setProducto(id, producto) {
    return this.set(`producto:${id}`, producto, TTL.PRODUCTO);
  }

  async invalidarProducto(id, tallerId) {
    await this.del(`producto:${id}`);
    await this.delPattern(`productos:lista:*`);
    if (tallerId) await this.del(`taller:${tallerId}:productos`);
  }

  async getProductosLista(queryHash) {
    return this.get(`productos:lista:${queryHash}`);
  }

  async setProductosLista(queryHash, resultado) {
    return this.set(`productos:lista:${queryHash}`, resultado, TTL.PRODUCTOS_LISTA);
  }

  async getUsuarioPerfil(userId) {
    return this.get(`usuario:${userId}:perfil`);
  }

  async setUsuarioPerfil(userId, perfil) {
    return this.set(`usuario:${userId}:perfil`, perfil, TTL.USUARIO_PERFIL);
  }

  async invalidarUsuario(userId) {
    await this.del(`usuario:${userId}:perfil`);
    await this.del(`usuario:${userId}:sesion`);
  }

  async getOrden(ordenId) {
    return this.get(`orden:${ordenId}`);
  }

  async setOrden(ordenId, orden) {
    return this.set(`orden:${ordenId}`, orden, TTL.ORDEN);
  }

  // ─── Rate limiting distribuido ────────────────────────────────────────────

  async checkRateLimit(identifier, maxRequests, windowSeconds) {
    if (!this.isConnected) return { allowed: true, remaining: maxRequests };

    const key = this.prefix + `ratelimit:${identifier}`;
    try {
      const current = await this.client.incr(key);
      if (current === 1) {
        await this.client.expire(key, windowSeconds);
      }
      return {
        allowed: current <= maxRequests,
        remaining: Math.max(0, maxRequests - current),
        current,
      };
    } catch (err) {
      logger.warn('Rate limit error:', err.message);
      return { allowed: true, remaining: maxRequests };
    }
  }

  // ─── Sesiones distribuidas ────────────────────────────────────────────────

  async setSession(sessionId, userData) {
    return this.set(`sesion:${sessionId}`, userData, TTL.SESION);
  }

  async getSession(sessionId) {
    return this.get(`sesion:${sessionId}`);
  }

  async deleteSession(sessionId) {
    return this.del(`sesion:${sessionId}`);
  }

  async blacklistToken(token, expiresIn) {
    return this.set(`blacklist:${token}`, 1, expiresIn);
  }

  async isTokenBlacklisted(token) {
    const val = await this.get(`blacklist:${token}`);
    return val !== null;
  }
}

const cacheService = new CacheService();

module.exports = { cacheService, TTL };

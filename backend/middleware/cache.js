/**
 * ConnectModa – Middleware de Caché Redis
 * Patrón cache-aside: leer caché → si miss → leer BD → guardar en caché
 *
 * Uso en rutas:
 *   router.get("/", cacheProductos, listarProductos);
 *   router.get("/:id", cacheProducto, obtenerProductoPorId);
 */

const redis  = require("../utils/redis");
const crypto = require("crypto");

// ─────────────────────────────────────────────
//  HELPER: generar hash de query params
//  Para que ?q=vestido&precio=50000 tenga una key única
// ─────────────────────────────────────────────
function hashQuery(query = {}) {
  const ordenado = Object.keys(query)
    .sort()
    .reduce((acc, k) => { acc[k] = query[k]; return acc; }, {});
  return crypto
    .createHash("md5")
    .update(JSON.stringify(ordenado))
    .digest("hex")
    .substring(0, 16); // 16 chars son suficientes
}

// ─────────────────────────────────────────────
//  HELPER: envolver res.json para interceptar respuesta
//  Así guardamos en Redis lo que el controller iba a responder
// ─────────────────────────────────────────────
function interceptarRespuesta(res, key, ttl) {
  const jsonOriginal = res.json.bind(res);

  res.json = function (body) {
    // Solo cachear respuestas exitosas
    if (res.statusCode >= 200 && res.statusCode < 300 && body?.ok !== false) {
      redis.set(key, body, ttl).catch(() => {});
    }
    return jsonOriginal(body);
  };
}

// ─────────────────────────────────────────────
//  FACTORY: crear middleware de caché genérico
// ─────────────────────────────────────────────
function crearCacheMiddleware({ keyFn, ttl, nombre }) {
  return async function cacheMiddleware(req, res, next) {
    // Nunca cachear si Redis no está disponible (fallback transparente)
    if (!redis.isConectado()) {
      return next();
    }

    // Nunca cachear requests con auth de escritura (POST, PUT, PATCH, DELETE)
    if (req.method !== "GET") {
      return next();
    }

    const key = keyFn(req);

    try {
      // ── Intento de HIT ───────────────────────────────────
      const cachedData = await redis.get(key);

      if (cachedData !== null) {
        res.setHeader("X-Cache",     "HIT");
        res.setHeader("X-Cache-Key", key);
        res.setHeader("X-Cache-TTL", ttl.toString());
        return res.status(200).json({ ...cachedData, _fromCache: true });
      }

      // ── MISS: dejar pasar al controller y capturar respuesta ──
      res.setHeader("X-Cache",     "MISS");
      res.setHeader("X-Cache-Key", key);

      interceptarRespuesta(res, key, ttl);
      next();

    } catch (err) {
      // Si Redis falla, continuar sin caché (nunca bloquear el request)
      console.error(`[Cache:${nombre}] Error:`, err.message);
      next();
    }
  };
}

// ─────────────────────────────────────────────
//  MIDDLEWARES ESPECÍFICOS
// ─────────────────────────────────────────────

/**
 * cacheProductos — GET /api/productos
 * Key: products:list:{hash_de_filters}
 * TTL: 60 minutos
 */
const cacheProductos = crearCacheMiddleware({
  nombre: "Productos",
  ttl:    redis.TTL.PRODUCTOS_LISTA,
  keyFn:  (req) => `${redis.PREFIX.PRODUCTOS_LISTA}:${hashQuery(req.query)}`,
});

/**
 * cacheProducto — GET /api/productos/:id
 * Key: product:{id}
 * TTL: 60 minutos
 */
const cacheProducto = crearCacheMiddleware({
  nombre: "Producto",
  ttl:    redis.TTL.PRODUCTO,
  keyFn:  (req) => `${redis.PREFIX.PRODUCTO}${req.params.id}`,
});

/**
 * cacheBusqueda — GET /api/buscar
 * Key: search:{hash_de_query_params}
 * TTL: 15 minutos (datos de búsqueda cambian más rápido)
 */
const cacheBusqueda = crearCacheMiddleware({
  nombre: "Busqueda",
  ttl:    redis.TTL.BUSQUEDA,
  keyFn:  (req) => `${redis.PREFIX.BUSQUEDA}${hashQuery(req.query)}`,
});

/**
 * cacheUsuario — GET /api/usuarios/:id
 * Key: user:{id}
 * TTL: 30 minutos
 */
const cacheUsuario = crearCacheMiddleware({
  nombre: "Usuario",
  ttl:    redis.TTL.USUARIO,
  keyFn:  (req) => `${redis.PREFIX.USUARIO}${req.params.id}`,
});

/**
 * cacheCategorias — GET /api/categorias
 * Key: categories (fija, sin parámetros)
 * TTL: 2 horas (las categorías cambian muy poco)
 */
const cacheCategorias = crearCacheMiddleware({
  nombre: "Categorias",
  ttl:    redis.TTL.CATEGORIAS,
  keyFn:  () => redis.PREFIX.CATEGORIAS,
});

// ─────────────────────────────────────────────
//  INVALIDACIÓN DE CACHÉ
//  Llamar desde los controllers después de mutaciones
// ─────────────────────────────────────────────

/**
 * Invalidar todo lo relacionado a un producto
 * Usar cuando se crea, actualiza o elimina un producto
 */
async function invalidarProducto(productoId) {
  const ops = await Promise.allSettled([
    redis.del(`${redis.PREFIX.PRODUCTO}${productoId}`),  // Producto individual
    redis.delPorPatron(`${redis.PREFIX.PRODUCTOS_LISTA}*`), // Todas las listas
    redis.delPorPatron(`${redis.PREFIX.BUSQUEDA}*`),        // Todas las búsquedas (pueden incluir este producto)
  ]);

  const eliminadas = ops.reduce((acc, op) => {
    if (op.status === "fulfilled") acc += (op.value || 0);
    return acc;
  }, 0);

  log("invalidarProducto", { productoId, eliminadas });
  return eliminadas;
}

/**
 * Invalidar caché de un usuario específico
 */
async function invalidarUsuario(usuarioId) {
  const count = await redis.del(`${redis.PREFIX.USUARIO}${usuarioId}`);
  log("invalidarUsuario", { usuarioId, eliminadas: count ? 1 : 0 });
  return count;
}

/**
 * Invalidar caché de categorías (cuando se añade o elimina una)
 */
async function invalidarCategorias() {
  const count = await redis.del(redis.PREFIX.CATEGORIAS);
  log("invalidarCategorias", { eliminadas: count ? 1 : 0 });
  return count;
}

/**
 * Invalidar todas las búsquedas cacheadas
 * Útil cuando se hace una actualización masiva de productos
 */
async function invalidarBusquedas() {
  const count = await redis.delPorPatron(`${redis.PREFIX.BUSQUEDA}*`);
  log("invalidarBusquedas", { eliminadas: count });
  return count;
}

/**
 * Invalidar absolutamente todo el caché de ConnectModa
 * Usar con precaución — aumenta carga en MongoDB temporalmente
 */
async function invalidarTodo() {
  const count = await redis.flushAll();
  log("invalidarTodo", { eliminadas: count });
  return count;
}

function log(accion, datos = {}) {
  console.log(JSON.stringify({
    ts:     new Date().toISOString(),
    modulo: "CacheMiddleware",
    accion,
    ...datos,
  }));
}

// ─────────────────────────────────────────────
//  HELPER: wrapper cache-aside para usar en controllers
//  cuando necesitas caché fuera de middleware HTTP
//
//  Ejemplo:
//    const datos = await withCache("product:abc123", TTL.PRODUCTO, () => Producto.findById("abc123"));
// ─────────────────────────────────────────────
async function withCache(key, ttl, fetchFn) {
  // Intentar desde Redis
  const cached = await redis.get(key);
  if (cached !== null) return cached;

  // Obtener desde la fuente de datos
  const datos = await fetchFn();

  // Guardar en Redis si obtuvimos algo
  if (datos !== null && datos !== undefined) {
    await redis.set(key, datos, ttl);
  }

  return datos;
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  // Middlewares de ruta
  cacheProductos,
  cacheProducto,
  cacheBusqueda,
  cacheUsuario,
  cacheCategorias,
  // Invalidación
  invalidarProducto,
  invalidarUsuario,
  invalidarCategorias,
  invalidarBusquedas,
  invalidarTodo,
  // Utilidad
  withCache,
  hashQuery,
};

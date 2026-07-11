/**
 * ConnectModa – Cliente Redis
 * Conexión centralizada con métodos tipados, logs y fallback a BD
 *
 * Modo degradado: si Redis no está disponible, la app sigue funcionando
 * normalmente — simplemente no usa caché (fallback transparente a MongoDB).
 */

const { createClient } = require("redis");

// ─────────────────────────────────────────────
//  TTLs POR TIPO (en segundos)
// ─────────────────────────────────────────────
const TTL = {
  PRODUCTOS_LISTA: parseInt(process.env.CACHE_TTL_PRODUCTOS || "3600"),   // 60 min
  PRODUCTO:        parseInt(process.env.CACHE_TTL_PRODUCTO   || "3600"),   // 60 min
  BUSQUEDA:        parseInt(process.env.CACHE_TTL_BUSQUEDA   || "900"),    // 15 min
  USUARIO:         parseInt(process.env.CACHE_TTL_USUARIO    || "1800"),   // 30 min
  CATEGORIAS:      parseInt(process.env.CACHE_TTL_CATEGORIAS || "7200"),   // 2 horas
  DEFAULT:         parseInt(process.env.CACHE_TTL            || "900"),    // 15 min
};

// ─────────────────────────────────────────────
//  PREFIJOS DE KEYS
// ─────────────────────────────────────────────
const PREFIX = {
  PRODUCTOS_LISTA: "products:list",
  PRODUCTO:        "product:",        // + id
  BUSQUEDA:        "search:",         // + hash de query
  USUARIO:         "user:",           // + id
  CATEGORIAS:      "categories",
  VENDEDOR:        "vendor:",         // + id
};

// ─────────────────────────────────────────────
//  ESTADO DE CONEXIÓN
// ─────────────────────────────────────────────
let _client   = null;
let _conectado = false;
let _intentosReconexion = 0;
const MAX_INTENTOS_RECONEXION = 5;

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "Redis",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  CONECTAR
// ─────────────────────────────────────────────
async function conectar() {
  const url = process.env.REDIS_URL
    || `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || "6379"}`;

  _client = createClient({
    url,
    socket: {
      reconnectStrategy: (intentos) => {
        _intentosReconexion = intentos;
        if (intentos >= MAX_INTENTOS_RECONEXION) {
          log("error", "reconexion_agotada", { intentos });
          return false; // Dejar de reconectar
        }
        const delay = Math.min(intentos * 500, 3000);
        log("warn", "reconectando", { intentos, delay });
        return delay;
      },
    },
  });

  // Eventos del cliente
  _client.on("connect",    () => { _conectado = true;  _intentosReconexion = 0; log("info", "conectado", { url: url.replace(/:\/\/.+@/, "://**@") }); });
  _client.on("ready",      () => log("info", "listo"));
  _client.on("end",        () => { _conectado = false; log("warn", "desconectado"); });
  _client.on("error",      (err) => { _conectado = false; log("error", "error_cliente", { error: err.message }); });
  _client.on("reconnecting", () => log("info", "reconectando"));

  try {
    await _client.connect();
    log("info", "inicializado");
  } catch (err) {
    log("error", "conexion_fallida", { error: err.message, msg: "App continuará sin caché" });
    _conectado = false;
  }

  return _client;
}

// ─────────────────────────────────────────────
//  GETTERS DE ESTADO
// ─────────────────────────────────────────────
function isConectado()   { return _conectado && _client?.isOpen; }
function getClient()     { return _client; }
function getEstado()     { return { conectado: _conectado, intentosReconexion: _intentosReconexion }; }

// ─────────────────────────────────────────────
//  MÉTODOS BASE — siempre con fallback silencioso
// ─────────────────────────────────────────────

/**
 * Guardar valor en Redis con TTL
 * @param {string} key
 * @param {any} valor — se serializa a JSON automáticamente
 * @param {number} [ttl] — segundos. Si omites, usa TTL.DEFAULT
 */
async function set(key, valor, ttl = TTL.DEFAULT) {
  if (!isConectado()) return false;
  try {
    const serializado = JSON.stringify(valor);
    await _client.setEx(key, ttl, serializado);
    log("info", "SET", { key, ttl, bytes: serializado.length });
    return true;
  } catch (err) {
    log("error", "SET_error", { key, error: err.message });
    return false;
  }
}

/**
 * Obtener valor de Redis
 * @returns {any|null} — valor deserializado, o null si no existe / error
 */
async function get(key) {
  if (!isConectado()) return null;
  try {
    const raw = await _client.get(key);
    if (raw === null) {
      log("info", "MISS", { key });
      return null;
    }
    log("info", "HIT", { key });
    return JSON.parse(raw);
  } catch (err) {
    log("error", "GET_error", { key, error: err.message });
    return null;
  }
}

/**
 * Eliminar una key específica
 */
async function del(key) {
  if (!isConectado()) return false;
  try {
    const count = await _client.del(key);
    log("info", "DEL", { key, eliminadas: count });
    return count > 0;
  } catch (err) {
    log("error", "DEL_error", { key, error: err.message });
    return false;
  }
}

/**
 * Eliminar múltiples keys por patrón (ej: "product:*")
 * SCAN es seguro para producción — no bloquea como KEYS
 */
async function delPorPatron(patron) {
  if (!isConectado()) return 0;
  try {
    let cursor  = 0;
    let total   = 0;
    const keysAEliminar = [];

    do {
      const resultado = await _client.scan(cursor, { MATCH: patron, COUNT: 100 });
      cursor = resultado.cursor;
      keysAEliminar.push(...resultado.keys);
    } while (cursor !== 0);

    if (keysAEliminar.length > 0) {
      await _client.del(keysAEliminar);
      total = keysAEliminar.length;
    }

    log("info", "DEL_PATRON", { patron, eliminadas: total });
    return total;
  } catch (err) {
    log("error", "DEL_PATRON_error", { patron, error: err.message });
    return 0;
  }
}

/**
 * Extender el TTL de una key existente
 */
async function expire(key, ttl) {
  if (!isConectado()) return false;
  try {
    await _client.expire(key, ttl);
    return true;
  } catch (err) {
    log("error", "EXPIRE_error", { key, error: err.message });
    return false;
  }
}

/**
 * Verificar si una key existe
 */
async function existe(key) {
  if (!isConectado()) return false;
  try {
    return (await _client.exists(key)) === 1;
  } catch (err) {
    return false;
  }
}

/**
 * Limpiar toda la caché de ConnectModa
 * (usa patrón para no afectar otros datos en el mismo Redis)
 */
async function flushAll() {
  return delPorPatron("*");
}

/**
 * Estadísticas de Redis (para el panel de admin)
 */
async function stats() {
  if (!isConectado()) return null;
  try {
    const info   = await _client.info("stats");
    const memory = await _client.info("memory");
    const dbSize = await _client.dbSize();

    const extraer = (texto, clave) => {
      const match = texto.match(new RegExp(`${clave}:(\\S+)`));
      return match ? match[1] : null;
    };

    return {
      keys_totales:       dbSize,
      hits:               extraer(info,   "keyspace_hits"),
      misses:             extraer(info,   "keyspace_misses"),
      memoria_usada:      extraer(memory, "used_memory_human"),
      memoria_pico:       extraer(memory, "used_memory_peak_human"),
      estado:             getEstado(),
    };
  } catch (err) {
    log("error", "STATS_error", { error: err.message });
    return null;
  }
}

/**
 * Cerrar conexión gracefully
 */
async function cerrar() {
  if (_client) {
    await _client.quit();
    _conectado = false;
    log("info", "conexion_cerrada");
  }
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  conectar,
  isConectado,
  getClient,
  getEstado,
  // Métodos de datos
  set,
  get,
  del,
  delPorPatron,
  expire,
  existe,
  flushAll,
  stats,
  cerrar,
  // Constantes
  TTL,
  PREFIX,
};

/**
 * ConnectModa - Middleware de Sanitización
 * Prevención de inyecciones NoSQL/MongoDB y XSS
 */

// ─────────────────────────────────────────────
//  Caracteres y operadores peligrosos en MongoDB
// ─────────────────────────────────────────────
const OPERADORES_MONGO = [
  "$where", "$gt", "$gte", "$lt", "$lte", "$ne", "$in",
  "$nin", "$or", "$and", "$not", "$nor", "$exists",
  "$type", "$mod", "$regex", "$text", "$search",
  "$elemMatch", "$size", "$all", "$slice",
];

const REGEX_OPERADORES = /\$[a-zA-Z]+/g;
const REGEX_HTML = /<[^>]*>/g;
const REGEX_ESPECIALES = /[{}[\]\\]/g;

// ─────────────────────────────────────────────
//  sanitizeQuery: limpiar string individual
// ─────────────────────────────────────────────
function sanitizeQuery(valor) {
  if (typeof valor !== "string") return "";

  return valor
    .trim()
    .replace(REGEX_HTML, "")           // Eliminar HTML/XSS
    .replace(REGEX_OPERADORES, "")     // Eliminar operadores MongoDB ($gt, etc)
    .replace(REGEX_ESPECIALES, "")     // Eliminar brackets peligrosos
    .substring(0, 200);                // Limitar longitud máxima
}

// ─────────────────────────────────────────────
//  sanitizeNumber: validar número dentro de rango
// ─────────────────────────────────────────────
function sanitizeNumber(valor, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = parseFloat(valor);
  if (isNaN(num)) return null;
  return Math.min(Math.max(num, min), max);
}

// ─────────────────────────────────────────────
//  sanitizeObject: limpiar objeto recursivamente
// ─────────────────────────────────────────────
function sanitizeObject(obj) {
  if (typeof obj !== "object" || obj === null) return {};

  const limpio = {};
  for (const key of Object.keys(obj)) {
    // Bloquear claves que empiecen con $ (operadores MongoDB)
    if (key.startsWith("$")) continue;

    const valor = obj[key];
    if (typeof valor === "string") {
      limpio[key] = sanitizeQuery(valor);
    } else if (typeof valor === "number") {
      limpio[key] = valor;
    } else if (Array.isArray(valor)) {
      limpio[key] = valor
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map((v) => (typeof v === "string" ? sanitizeQuery(v) : v));
    } else if (typeof valor === "object") {
      // No permitir objetos anidados en query params (previene { $gt: 0 })
      continue;
    } else {
      limpio[key] = valor;
    }
  }
  return limpio;
}

// ─────────────────────────────────────────────
//  buildTextSearch: texto seguro para $text
// ─────────────────────────────────────────────
function buildTextSearch(texto) {
  if (!texto || typeof texto !== "string") return null;

  const limpio = sanitizeQuery(texto);
  if (!limpio) return null;

  // Dividir en palabras y encerrar frases multi-palabra entre comillas
  const palabras = limpio
    .split(/\s+/)
    .filter((p) => p.length >= 2) // Mínimo 2 caracteres
    .map((p) => p.toLowerCase());

  if (!palabras.length) return null;

  return palabras.join(" ");
}

// ─────────────────────────────────────────────
//  MIDDLEWARE: sanitizar req.query automáticamente
// ─────────────────────────────────────────────
function sanitizeMiddleware(req, res, next) {
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  next();
}

// ─────────────────────────────────────────────
//  MIDDLEWARE: rate limiting básico por IP
// ─────────────────────────────────────────────
const busquedasPorIP = new Map();
const VENTANA_MS = 60 * 1000; // 1 minuto
const MAX_BUSQUEDAS = 60;     // 60 búsquedas por minuto

function rateLimitBusqueda(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const ahora = Date.now();

  if (!busquedasPorIP.has(ip)) {
    busquedasPorIP.set(ip, { count: 1, inicio: ahora });
    return next();
  }

  const datos = busquedasPorIP.get(ip);

  // Resetear ventana si ya pasó 1 minuto
  if (ahora - datos.inicio > VENTANA_MS) {
    busquedasPorIP.set(ip, { count: 1, inicio: ahora });
    return next();
  }

  datos.count++;

  if (datos.count > MAX_BUSQUEDAS) {
    return res.status(429).json({
      ok: false,
      mensaje: "Demasiadas búsquedas. Intenta de nuevo en un momento.",
    });
  }

  next();
}

// Limpiar el mapa cada 5 minutos para evitar memory leaks
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of busquedasPorIP.entries()) {
    if (ahora - datos.inicio > VENTANA_MS * 5) {
      busquedasPorIP.delete(ip);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  sanitizeQuery,
  sanitizeNumber,
  sanitizeObject,
  buildTextSearch,
  sanitizeMiddleware,
  rateLimitBusqueda,
};

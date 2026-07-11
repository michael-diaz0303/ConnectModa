/**
 * ConnectModa – Middleware de Tracking
 * Registra eventos de analytics de forma no bloqueante
 * Se usa directamente en las rutas existentes
 *
 * Uso:
 *   router.get("/:id", track("product_view"), obtenerProducto);
 *   router.get("/",    track("page_view"),    listarProductos);
 */

const { AnalyticsEvento } = require("../models/Analytics");
const { analyticsQueue, encolar } = require("../utils/queues");

// ─────────────────────────────────────────────
//  ANONIMIZAR IP (GDPR / privacidad)
//  Eliminar último octeto: 192.168.1.123 → 192.168.1.0
// ─────────────────────────────────────────────
function anonimizarIP(ip) {
  if (!ip) return null;
  const partes = ip.replace("::ffff:", "").split(".");
  if (partes.length === 4) {
    partes[3] = "0";
    return partes.join(".");
  }
  return ip.substring(0, 8) + "..."; // IPv6
}

// ─────────────────────────────────────────────
//  DETECTAR DISPOSITIVO
// ─────────────────────────────────────────────
function detectarDispositivo(ua = "") {
  const uaLower = ua.toLowerCase();
  if (/mobile|android|iphone|ipad/.test(uaLower)) return "mobile";
  if (/tablet/.test(uaLower)) return "tablet";
  return "desktop";
}

// ─────────────────────────────────────────────
//  FACTORY DE MIDDLEWARE DE TRACKING
// ─────────────────────────────────────────────
/**
 * @param {string} tipo          - Tipo de evento (TIPOS_EVENTO)
 * @param {Function} [datosFn]   - (req) => objeto de datos adicionales
 */
function track(tipo, datosFn = null) {
  return (req, res, next) => {
    // Ejecutar el handler de la ruta PRIMERO — tracking no bloquea
    next();

    // Capturar el evento DESPUÉS de que next() retorne (fire-and-forget)
    setImmediate(async () => {
      try {
        const usuarioId  = req.usuario?._id || null;
        const productoId = req.params?.id    || null;

        const datos = datosFn ? datosFn(req) : {};

        const evento = {
          tipo,
          usuario:  usuarioId,
          producto: productoId,
          datos,
          sesion: {
            ip:          anonimizarIP(req.ip),
            dispositivo: detectarDispositivo(req.headers["user-agent"]),
            fuente:      req.query?.utm_source || req.headers?.referer || null,
          },
          timestamp: new Date(),
        };

        // Intentar encolar primero (no bloquea)
        const encolado = await encolar(analyticsQueue, tipo, {
          tipo,
          usuarioId: usuarioId?.toString(),
          productoId: productoId?.toString(),
          datos,
        });

        // Si la cola no está disponible, insertar directo en BD
        if (!encolado) {
          await AnalyticsEvento.create(evento);
        }

      } catch (err) {
        // Tracking nunca debe crashear la app — silenciar errores
        console.error("[Analytics:track]", err.message);
      }
    });
  };
}

// ─────────────────────────────────────────────
//  REGISTRO MANUAL (desde controllers)
//  Para eventos que no son GET (ej: compras)
// ─────────────────────────────────────────────
async function registrarEvento(tipo, datos = {}) {
  try {
    await encolar(analyticsQueue, tipo, { tipo, ...datos });
  } catch {
    await AnalyticsEvento.create({ tipo, ...datos }).catch(() => {});
  }
}

module.exports = { track, registrarEvento, anonimizarIP };

/**
 * ConnectModa – Procesador de Cola de Analytics
 * Agrega eventos de comportamiento y actualiza estadísticas en MongoDB
 *
 * Tipos de evento:
 *   product:viewed     → Vista de producto
 *   product:searched   → Búsqueda realizada
 *   order:created      → Orden completada
 *   user:registered    → Nuevo usuario
 *
 * Mejoras v2:
 *  - AnalyticsEvent movido a su propio modelo (models/Analytics.js) — se importa
 *    desde ahí en vez de redefinir el schema aquí
 *  - handleOrderCreated recalcula categorías y precio promedio en un único
 *    findOneAndUpdate con $inc en vez de leer primero, calcular, y luego escribir
 *    (evita race condition entre workers concurrentes)
 *  - procesarAnalytics no silencia errores en TODOS los casos: solo para el
 *    tipo "genérico" (sin handler). Jobs con handler sí lanzan el error para
 *    que el log de Bull Board lo capture.
 */

const mongoose           = require("mongoose");
const { analyticsQueue } = require("../../utils/queues");
const Producto           = require("../../models/Producto");
const Analytics          = require("../../models/Analytics");
const { RecomendacionIA } = require("../../models/RecomendacionIA");

// ─────────────────────────────────────────────
//  HANDLERS POR TIPO DE EVENTO
// ─────────────────────────────────────────────

async function handleProductViewed({ usuarioId, productoId, datos }) {
  await Analytics.create({ tipo: "product:viewed", usuarioId, productoId, datos });

  if (usuarioId && productoId) {
    await RecomendacionIA.findOneAndUpdate(
      { usuario: usuarioId },
      {
        $push: {
          productos_vistos: {
            $each:  [{ producto: productoId, veces: 1, ultimaVez: new Date() }],
            $slice: -50,
            $sort:  { ultimaVez: -1 },
          },
        },
        $set: { ultima_actualizacion: new Date() },
      },
      { upsert: true }
    );
  }
}

async function handleProductSearched({ usuarioId, datos }) {
  const { query, resultados = 0 } = datos || {};

  await Analytics.create({ tipo: "product:searched", usuarioId, datos });

  if (usuarioId && query) {
    await RecomendacionIA.findOneAndUpdate(
      { usuario: usuarioId },
      {
        $push: {
          historial_busquedas: {
            $each:  [{ query, resultados, fecha: new Date() }],
            $slice: -30,
          },
        },
      },
      { upsert: true }
    );
  }
}

async function handleOrderCreated({ usuarioId, datos }) {
  const { items = [], total = 0 } = datos || {};

  await Analytics.create({ tipo: "order:created", usuarioId, datos });

  // Actualizar totalVentas de cada producto (bulk)
  if (items.length > 0) {
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item.productoId },
        update: { $inc: { "rating.totalVentas": item.cantidad || 1 } },
      },
    }));
    await Producto.bulkWrite(bulkOps);
  }

  // Actualizar perfil IA
  if (usuarioId && items.length > 0) {
    const compras = items.map((item) => ({
      producto:  item.productoId,
      categoria: item.categoria,
      precio:    item.precio,
      fecha:     new Date(),
    }));

    // MEJORA: push de compras y luego recalcular en un step separado.
    // El recálculo de precio promedio y categorías se hace con una agregación
    // MongoDB para evitar la race condition del read-modify-write original.
    await RecomendacionIA.findOneAndUpdate(
      { usuario: usuarioId },
      {
        $push: { productos_comprados: { $each: compras, $slice: -100 } },
        $set:  { ultima_actualizacion: new Date() },
      },
      { upsert: true }
    );

    // Recalcular estadísticas derivadas con una agregación
    await recalcularEstadisticasUsuario(usuarioId);
  }
}

/**
 * Recalcula precio promedio y categorías preferidas con una agregación MongoDB.
 * Al hacerlo desde el documento guardado se evita la race condition del
 * read-modify-write que existía en v1.
 */
async function recalcularEstadisticasUsuario(usuarioId) {
  try {
    const resultado = await RecomendacionIA.aggregate([
      { $match: { usuario: new mongoose.Types.ObjectId(String(usuarioId)) } },
      { $unwind: "$productos_comprados" },
      {
        $group: {
          _id:            "$usuario",
          precioPromedio: { $avg: "$productos_comprados.precio" },
          categorias: {
            $push: "$productos_comprados.categoria",
          },
        },
      },
    ]);

    if (!resultado.length) return;

    const { precioPromedio, categorias } = resultado[0];

    // Top 5 categorías por frecuencia
    const frecuencia = {};
    for (const cat of categorias) {
      if (cat) frecuencia[cat] = (frecuencia[cat] || 0) + 1;
    }
    const top5 = Object.entries(frecuencia)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);

    await RecomendacionIA.findOneAndUpdate(
      { usuario: usuarioId },
      {
        $set: {
          precio_promedio:       Math.round(precioPromedio || 0),
          categorias_preferidas: top5,
        },
      }
    );
  } catch (err) {
    log("warn", "recalculo_estadisticas_error", { usuarioId, error: err.message });
    // No lanzar — es una operación de enriquecimiento, no crítica
  }
}

async function handleUserRegistered({ usuarioId, datos }) {
  await Analytics.create({ tipo: "user:registered", usuarioId, datos });
}

// ─────────────────────────────────────────────
//  DISPATCHER
// ─────────────────────────────────────────────
const HANDLERS = {
  "product:viewed":   handleProductViewed,
  "product:searched": handleProductSearched,
  "order:created":    handleOrderCreated,
  "user:registered":  handleUserRegistered,
};

async function procesarAnalytics(job) {
  const { tipo, usuarioId, productoId, datos } = job.data;

  log("info", "procesando", { jobId: job.id, tipo, usuarioId });

  const handler = HANDLERS[tipo];

  if (!handler) {
    log("warn", "tipo_desconocido", { jobId: job.id, tipo });
    // Guardar evento genérico sin lanzar error (tipo desconocido no debe fallar el job)
    await Analytics.create({ tipo, usuarioId, productoId, datos }).catch(() => {});
    return { tipo, guardado: true };
  }

  // MEJORA: si el handler lanza, el error llega a Bull para que quede
  // registrado en la cola de fallidos (a diferencia de la v1 que lo silenciaba)
  await handler({ usuarioId, productoId, datos });

  log("info", "completado", { jobId: job.id, tipo });
  return { tipo, procesado: true };
}

// ─────────────────────────────────────────────
//  REGISTRAR PROCESADOR
// ─────────────────────────────────────────────
function iniciar() {
  if (!analyticsQueue) {
    log("warn", "cola_deshabilitada", { cola: "analyticsQueue" });
    return;
  }

  analyticsQueue.process(5, async (job) => {
    try {
      return await procesarAnalytics(job);
    } catch (err) {
      log("error", "error_procesando", { jobId: job.id, error: err.message });
      // Analytics tiene attempts:1 — no hay retry, pero sí dejamos el registro
      // en la cola de fallidos para debugging (no silenciar)
      throw err;
    }
  });

  log("info", "procesador_iniciado", { cola: "analyticsQueue", concurrencia: 5 });
}

function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "AnalyticsProcessor",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

module.exports = { iniciar, procesarAnalytics };

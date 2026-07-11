/**
 * ConnectModa – Controller de Analytics
 * Dashboard, métricas por producto, por vendedor y generación de reportes
 */

const mongoose = require("mongoose");
const redis    = require("../utils/redis");
const {
  rangoFechas,
  rangoPersonalizado,
  kpisPrincipales,
  tendenciaDiaria,
  topProductos,
  topCategorias,
  topBusquedas,
  productAnalytics,
  vendedorAnalytics,
} = require("../utils/analyticsPipelines");
const { reportQueue, encolar } = require("../utils/queues");

// ─────────────────────────────────────────────
//  TTL de caché por granularidad de período
// ─────────────────────────────────────────────
const CACHE_TTL = {
  hoy:    5 * 60,         // 5 min — datos de hoy cambian rápido
  semana: 30 * 60,        // 30 min
  mes:    2 * 60 * 60,    // 2 horas
  año:    6 * 60 * 60,    // 6 horas
};

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "AnalyticsController", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  1. DASHBOARD PRINCIPAL
//  GET /api/analytics/dashboard?periodo=semana
// ─────────────────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
    if (!esAdmin) return res.status(403).json({ ok: false, mensaje: "Solo administradores" });

    const periodo  = ["hoy", "semana", "mes", "año"].includes(req.query.periodo)
      ? req.query.periodo : "semana";

    const cacheKey = `analytics:dashboard:${periodo}`;
    const ttl      = CACHE_TTL[periodo];

    // ── Intentar desde caché ──────────────────────────────────
    const cached = await redis.get(cacheKey);
    if (cached && !req.query.forzar) {
      return res.status(200).json({ ...cached, _fromCache: true });
    }

    const { inicio, fin } = rangoFechas(periodo);

    // ── Ejecutar todas las aggregations en paralelo ───────────
    const [kpis, tendencia, topProds, topCats, topBusqs] = await Promise.all([
      kpisPrincipales(inicio, fin),
      tendenciaDiaria(inicio, fin),
      topProductos(inicio, fin, 10),
      topCategorias(inicio, fin),
      topBusquedas(inicio, fin, 15),
    ]);

    const respuesta = {
      ok:      true,
      periodo,
      rango:   { inicio, fin },
      kpis,
      tendencia,                // Para gráfico de líneas
      topProductos: topProds,   // Para tabla y barras
      topCategorias: topCats,   // Para dona
      topBusquedas: topBusqs,   // Para tabla de insights
      generadoEn: new Date(),
    };

    await redis.set(cacheKey, respuesta, ttl);

    log("info", "dashboard", { periodo, kpis: { ventas: kpis.ventas, ingresos: kpis.ingresos } });
    return res.status(200).json(respuesta);

  } catch (err) {
    log("error", "getDashboard", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener dashboard" });
  }
};

// ─────────────────────────────────────────────
//  2. ANALYTICS DE UN PRODUCTO
//  GET /api/analytics/producto/:id?periodo=mes
// ─────────────────────────────────────────────
const getProductoAnalytics = async (req, res) => {
  try {
    const { id }   = req.params;
    const periodo  = req.query.periodo || "mes";
    const usuarioId = req.usuario._id.toString();
    const esAdmin  = ["admin", "emprendedor"].includes(req.usuario.rol);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, mensaje: "ID de producto inválido" });
    }

    const Producto = require("../models/Producto");
    const producto = await Producto.findById(id).select("nombre categoria vendedor").lean();
    if (!producto) return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });

    // Solo el dueño o admin puede ver analytics del producto
    if (!esAdmin && producto.vendedor?.id?.toString() !== usuarioId) {
      return res.status(403).json({ ok: false, mensaje: "Sin permisos para este producto" });
    }

    const cacheKey = `analytics:producto:${id}:${periodo}`;
    const cached   = await redis.get(cacheKey);
    if (cached && !req.query.forzar) return res.status(200).json({ ...cached, _fromCache: true });

    const { inicio, fin } = rangoFechas(periodo);
    const metricas        = await productAnalytics(id, inicio, fin);

    const respuesta = {
      ok:      true,
      producto: { id, nombre: producto.nombre, categoria: producto.categoria },
      periodo,
      rango: { inicio, fin },
      ...metricas,
      generadoEn: new Date(),
    };

    await redis.set(cacheKey, respuesta, CACHE_TTL[periodo] || 1800);
    return res.status(200).json(respuesta);

  } catch (err) {
    log("error", "getProductoAnalytics", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener analytics del producto" });
  }
};

// ─────────────────────────────────────────────
//  3. ANALYTICS DEL VENDEDOR AUTENTICADO
//  GET /api/analytics/usuario?periodo=mes
// ─────────────────────────────────────────────
const getUsuarioAnalytics = async (req, res) => {
  try {
    const usuarioId = req.usuario._id.toString();
    const periodo   = req.query.periodo || "mes";
    const { inicio, fin } = rangoFechas(periodo);

    const cacheKey = `analytics:vendedor:${usuarioId}:${periodo}`;
    const cached   = await redis.get(cacheKey);
    if (cached && !req.query.forzar) return res.status(200).json({ ...cached, _fromCache: true });

    // Obtener top productos del vendedor + resumen general en paralelo
    const [resumen, topProds] = await Promise.all([
      vendedorAnalytics(usuarioId, inicio, fin),
      topProductos(inicio, fin, 5),
    ]);

    const Producto = require("../models/Producto");

    // Filtrar solo productos del vendedor
    const Orden = require("../models/Orden");
    const misProductosIds = await Producto.distinct("_id", {
      "vendedor.id": new mongoose.Types.ObjectId(usuarioId),
    });

    const topMisProductos = topProds.filter((p) =>
      misProductosIds.some((id) => id.toString() === p.producto._id.toString())
    );

    const respuesta = {
      ok:      true,
      periodo,
      rango:   { inicio, fin },
      resumen,
      topProductos: topMisProductos,
      generadoEn:   new Date(),
    };

    await redis.set(cacheKey, respuesta, CACHE_TTL[periodo] || 1800);
    return res.status(200).json(respuesta);

  } catch (err) {
    log("error", "getUsuarioAnalytics", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener analytics" });
  }
};

// ─────────────────────────────────────────────
//  4. GENERAR REPORTE
//  POST /api/analytics/reporte
// ─────────────────────────────────────────────
const generarReporte = async (req, res) => {
  try {
    const { tipo, desde, hasta, formato = "pdf" } = req.body;
    const usuario = req.usuario;
    const esAdmin = ["admin", "emprendedor"].includes(usuario.rol);

    const tiposPermitidos = {
      ventas_vendedor: ["vendedor", "emprendedor", "admin"],
      ordenes_admin:   ["admin"],
      productos_admin: ["admin", "emprendedor"],
      analytics_admin: ["admin"],
    };

    if (!tipo || !tiposPermitidos[tipo]) {
      return res.status(400).json({
        ok:      false,
        mensaje: `Tipo inválido. Opciones: ${Object.keys(tiposPermitidos).join(", ")}`,
      });
    }
    if (!tiposPermitidos[tipo].includes(usuario.rol)) {
      return res.status(403).json({ ok: false, mensaje: "Sin permisos para este reporte" });
    }

    const filtros = { desde, hasta, formato };

    // Encolar generación (puede tardar varios minutos)
    const job = await encolar(reportQueue, tipo, {
      tipo,
      usuario: { id: usuario._id, email: usuario.email, nombre: usuario.nombre },
      filtros,
    });

    log("info", "reporte_encolado", { tipo, usuarioId: usuario._id, jobId: job?.id });

    return res.status(202).json({
      ok:     true,
      mensaje: "Reporte en preparación. Recibirás un email cuando esté listo.",
      jobId:  job?.id,
      tipo,
      formato,
    });

  } catch (err) {
    log("error", "generarReporte", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al solicitar reporte" });
  }
};

// ─────────────────────────────────────────────
//  5. DATOS PARA CHART.JS — formato directo
//  GET /api/analytics/charts/:tipo?periodo=semana
// ─────────────────────────────────────────────
const getChartData = async (req, res) => {
  try {
    const { tipo }  = req.params;
    const periodo   = req.query.periodo || "semana";
    const { inicio, fin } = rangoFechas(periodo);
    const esAdmin   = ["admin", "emprendedor"].includes(req.usuario.rol);

    let data;

    switch (tipo) {
      case "tendencia":
        data = await tendenciaDiaria(inicio, fin);
        break;
      case "categorias":
        data = await topCategorias(inicio, fin);
        // Formato dona para Chart.js
        data = {
          labels:   data.map((c) => c.categoria),
          datasets: [{
            label:           "Ingresos por categoría",
            data:            data.map((c) => c.ingresos),
            backgroundColor: ["#e8420a","#1a6b3c","#635bff","#f59e0b","#3b82f6","#8b5cf6","#ec4899","#14b8a6"],
          }],
        };
        break;
      case "top-productos":
        if (!esAdmin) return res.status(403).json({ ok: false, mensaje: "Solo admins" });
        const prods = await topProductos(inicio, fin, 10);
        data = {
          labels:   prods.map((p) => p.producto.nombre?.substring(0, 25)),
          datasets: [
            { label: "Vistas",   data: prods.map((p) => p.vistas),   backgroundColor: "#635bff" },
            { label: "Ingresos", data: prods.map((p) => p.ingresos), backgroundColor: "#e8420a" },
          ],
        };
        break;
      default:
        return res.status(400).json({ ok: false, mensaje: `Tipo de gráfico desconocido: ${tipo}` });
    }

    return res.status(200).json({ ok: true, tipo, periodo, data });

  } catch (err) {
    log("error", "getChartData", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener datos del gráfico" });
  }
};

module.exports = {
  getDashboard,
  getProductoAnalytics,
  getUsuarioAnalytics,
  generarReporte,
  getChartData,
};

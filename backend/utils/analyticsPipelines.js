/**
 * ConnectModa – Pipelines de Agregación MongoDB
 * Reutilizables por el analyticsController y el generador de reportes
 */

const mongoose = require("mongoose");
const { AnalyticsEvento, EstadisticaDiaria } = require("../models/Analytics");
const Orden    = require("../models/Orden");
const Producto = require("../models/Producto");

// ─────────────────────────────────────────────
//  HELPERS DE FECHA
// ─────────────────────────────────────────────
function rangoFechas(periodo) {
  const ahora  = new Date();
  const inicio = new Date();

  switch (periodo) {
    case "hoy":    inicio.setHours(0, 0, 0, 0); break;
    case "semana": inicio.setDate(ahora.getDate() - 7); break;
    case "mes":    inicio.setMonth(ahora.getMonth() - 1); break;
    case "año":    inicio.setFullYear(ahora.getFullYear() - 1); break;
    default:       inicio.setDate(ahora.getDate() - 30);
  }

  return { inicio, fin: ahora };
}

function rangoPersonalizado(desde, hasta) {
  return {
    inicio: new Date(desde),
    fin:    hasta ? new Date(hasta) : new Date(),
  };
}

// ─────────────────────────────────────────────
//  1. KPIs PRINCIPALES — para el dashboard
// ─────────────────────────────────────────────
async function kpisPrincipales(inicio, fin) {
  const [
    eventosRaw,
    ventasRaw,
    usuariosNuevos,
  ] = await Promise.all([

    // Visitas, búsquedas, vistas de producto
    AnalyticsEvento.aggregate([
      { $match: { timestamp: { $gte: inicio, $lte: fin } } },
      {
        $group: {
          _id:             "$tipo",
          total:           { $sum: 1 },
          usuariosUnicos:  { $addToSet: "$usuario" },
        },
      },
    ]),

    // Ventas e ingresos desde órdenes (fuente de verdad)
    Orden.aggregate([
      {
        $match: {
          estado:    { $in: ["pagado", "enviado", "entregado"] },
          creadoEn:  { $gte: inicio, $lte: fin },
        },
      },
      {
        $group: {
          _id:           null,
          totalVentas:   { $sum: 1 },
          ingresos:      { $sum: "$total.total" },
          ticketPromedio:{ $avg: "$total.total" },
          totalItems:    { $sum: { $size: "$items" } },
        },
      },
    ]),

    // Usuarios que se registraron en el período
    AnalyticsEvento.countDocuments({
      tipo:      "user_registered",
      timestamp: { $gte: inicio, $lte: fin },
    }),
  ]);

  // Mapear resultados de eventos
  const mapaEventos = {};
  eventosRaw.forEach((e) => { mapaEventos[e._id] = e; });

  const pageViews    = mapaEventos["page_view"]?.total    || 0;
  const productViews = mapaEventos["product_view"]?.total || 0;
  const busquedas    = mapaEventos["search"]?.total       || 0;

  const usuariosUnicosSet = new Set([
    ...(mapaEventos["page_view"]?.usuariosUnicos    || []),
    ...(mapaEventos["product_view"]?.usuariosUnicos || []),
  ].filter(Boolean).map(String));

  const ventas  = ventasRaw[0] || { totalVentas: 0, ingresos: 0, ticketPromedio: 0, totalItems: 0 };

  // Tasa de conversión = ventas / visitas únicas
  const conversionRate = usuariosUnicosSet.size > 0
    ? ((ventas.totalVentas / usuariosUnicosSet.size) * 100).toFixed(2)
    : 0;

  return {
    visitas:          pageViews + productViews,
    usuariosUnicos:   usuariosUnicosSet.size,
    busquedas,
    ventas:           ventas.totalVentas,
    ingresos:         Math.round(ventas.ingresos || 0),
    ticketPromedio:   Math.round(ventas.ticketPromedio || 0),
    totalItems:       ventas.totalItems,
    usuariosNuevos,
    conversionRate:   parseFloat(conversionRate),
  };
}

// ─────────────────────────────────────────────
//  2. TENDENCIA DIARIA — datos para gráficos de línea
// ─────────────────────────────────────────────
async function tendenciaDiaria(inicio, fin) {
  const [eventos, ventas] = await Promise.all([
    AnalyticsEvento.aggregate([
      { $match: { timestamp: { $gte: inicio, $lte: fin } } },
      {
        $group: {
          _id: {
            fecha: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            tipo:  "$tipo",
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { "_id.fecha": 1 } },
    ]),

    Orden.aggregate([
      {
        $match: {
          estado:   { $in: ["pagado", "enviado", "entregado"] },
          creadoEn: { $gte: inicio, $lte: fin },
        },
      },
      {
        $group: {
          _id:      { $dateToString: { format: "%Y-%m-%d", date: "$creadoEn" } },
          ventas:   { $sum: 1 },
          ingresos: { $sum: "$total.total" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Construir mapa por fecha
  const mapaFechas = {};
  eventos.forEach(({ _id, total }) => {
    if (!mapaFechas[_id.fecha]) mapaFechas[_id.fecha] = { fecha: _id.fecha };
    mapaFechas[_id.fecha][_id.tipo] = (mapaFechas[_id.fecha][_id.tipo] || 0) + total;
  });

  ventas.forEach(({ _id, ventas: v, ingresos: i }) => {
    if (!mapaFechas[_id]) mapaFechas[_id] = { fecha: _id };
    mapaFechas[_id].ventas   = v;
    mapaFechas[_id].ingresos = Math.round(i || 0);
  });

  // Formato Chart.js
  const datos = Object.values(mapaFechas).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const labels = datos.map((d) => d.fecha);

  return {
    labels,
    datasets: {
      visitas:   datos.map((d) => (d.page_view || 0) + (d.product_view || 0)),
      busquedas: datos.map((d) => d.search     || 0),
      ventas:    datos.map((d) => d.ventas      || 0),
      ingresos:  datos.map((d) => d.ingresos    || 0),
    },
  };
}

// ─────────────────────────────────────────────
//  3. TOP PRODUCTOS — para tabla y gráfico de barras
// ─────────────────────────────────────────────
async function topProductos(inicio, fin, limite = 10) {
  const [vistas, ventas] = await Promise.all([
    AnalyticsEvento.aggregate([
      {
        $match: {
          tipo:      "product_view",
          producto:  { $ne: null },
          timestamp: { $gte: inicio, $lte: fin },
        },
      },
      { $group: { _id: "$producto", vistas: { $sum: 1 } } },
      { $sort: { vistas: -1 } },
      { $limit: limite * 2 }, // Pedir más para el join
    ]),

    Orden.aggregate([
      {
        $match: {
          estado:   { $in: ["pagado", "enviado", "entregado"] },
          creadoEn: { $gte: inicio, $lte: fin },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id:      "$items.producto",
          unidades: { $sum: "$items.cantidad" },
          ingresos: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { ingresos: -1 } },
      { $limit: limite * 2 },
    ]),
  ]);

  // Merge por productoId
  const mapaVistas  = new Map(vistas.map((v) => [v._id.toString(), v.vistas]));
  const mapaVentas  = new Map(ventas.map((v) => [v._id.toString(), { unidades: v.unidades, ingresos: v.ingresos }]));

  const todosIds = [...new Set([...mapaVistas.keys(), ...mapaVentas.keys()])];

  const productos = await Producto.find({ _id: { $in: todosIds } })
    .select("nombre categoria imagenes precio")
    .lean();

  const resultado = productos.map((p) => {
    const id = p._id.toString();
    return {
      producto:  p,
      vistas:    mapaVistas.get(id)  || 0,
      unidades:  mapaVentas.get(id)?.unidades || 0,
      ingresos:  Math.round(mapaVentas.get(id)?.ingresos || 0),
    };
  });

  // Ordenar por ingresos + vistas combinados
  resultado.sort((a, b) => (b.ingresos + b.vistas * 100) - (a.ingresos + a.vistas * 100));

  return resultado.slice(0, limite);
}

// ─────────────────────────────────────────────
//  4. TOP CATEGORÍAS — para gráfico de dona
// ─────────────────────────────────────────────
async function topCategorias(inicio, fin) {
  const [vistas, ventas] = await Promise.all([
    AnalyticsEvento.aggregate([
      {
        $match: {
          tipo:      "product_view",
          timestamp: { $gte: inicio, $lte: fin },
          "datos.categoria": { $exists: true },
        },
      },
      { $group: { _id: "$datos.categoria", vistas: { $sum: 1 } } },
      { $sort: { vistas: -1 } },
      { $limit: 10 },
    ]),

    Orden.aggregate([
      {
        $match: { estado: { $in: ["pagado", "enviado", "entregado"] }, creadoEn: { $gte: inicio, $lte: fin } },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id:      "$items.snapshotProducto.categoria",
          ventas:   { $sum: 1 },
          ingresos: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { ingresos: -1 } },
    ]),
  ]);

  const mapaVentas = new Map(ventas.map((v) => [v._id, { ventas: v.ventas, ingresos: v.ingresos }]));

  return vistas.map((v) => ({
    categoria: v._id,
    vistas:    v.vistas,
    ventas:    mapaVentas.get(v._id)?.ventas   || 0,
    ingresos:  Math.round(mapaVentas.get(v._id)?.ingresos || 0),
  }));
}

// ─────────────────────────────────────────────
//  5. ANALYTICS DE UN PRODUCTO ESPECÍFICO
// ─────────────────────────────────────────────
async function productAnalytics(productoId, inicio, fin) {
  const pid = new mongoose.Types.ObjectId(productoId);

  const [vistas, ventas, busquedas] = await Promise.all([
    // Vistas por día
    AnalyticsEvento.aggregate([
      {
        $match: {
          tipo:      "product_view",
          producto:  pid,
          timestamp: { $gte: inicio, $lte: fin },
        },
      },
      {
        $group: {
          _id:             { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          vistas:          { $sum: 1 },
          usuariosUnicos:  { $addToSet: "$usuario" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Ventas del producto
    Orden.aggregate([
      {
        $match: {
          estado:          { $in: ["pagado", "enviado", "entregado"] },
          "items.producto": pid,
          creadoEn:        { $gte: inicio, $lte: fin },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.producto": pid } },
      {
        $group: {
          _id:      { $dateToString: { format: "%Y-%m-%d", date: "$creadoEn" } },
          ventas:   { $sum: "$items.cantidad" },
          ingresos: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Búsquedas que llevaron a este producto
    AnalyticsEvento.countDocuments({
      tipo:     "search",
      producto: pid,
      timestamp: { $gte: inicio, $lte: fin },
    }),
  ]);

  const totalVistas    = vistas.reduce((a, v) => a + v.vistas, 0);
  const totalVentas    = ventas.reduce((a, v) => a + v.ventas, 0);
  const totalIngresos  = ventas.reduce((a, v) => a + v.ingresos, 0);
  const conversionRate = totalVistas > 0 ? ((totalVentas / totalVistas) * 100).toFixed(2) : 0;

  const labels    = [...new Set([...vistas.map((v) => v._id), ...ventas.map((v) => v._id)])].sort();
  const mapaV     = new Map(vistas.map((v)  => [v._id, v.vistas]));
  const mapaVentas = new Map(ventas.map((v) => [v._id, { ventas: v.ventas, ingresos: v.ingresos }]));

  return {
    resumen: {
      totalVistas,
      totalVentas,
      totalIngresos: Math.round(totalIngresos),
      busquedas,
      conversionRate: parseFloat(conversionRate),
    },
    grafico: {
      labels,
      vistas:   labels.map((l) => mapaV.get(l) || 0),
      ventas:   labels.map((l) => mapaVentas.get(l)?.ventas   || 0),
      ingresos: labels.map((l) => Math.round(mapaVentas.get(l)?.ingresos || 0)),
    },
  };
}

// ─────────────────────────────────────────────
//  6. ANALYTICS DE UN VENDEDOR
// ─────────────────────────────────────────────
async function vendedorAnalytics(vendedorId, inicio, fin) {
  const vid = new mongoose.Types.ObjectId(vendedorId);

  // Productos del vendedor
  const productosIds = await Producto.distinct("_id", { "vendedor.id": vid });

  const [vistas, ventas, periodoAnterior] = await Promise.all([
    // Vistas de sus productos
    AnalyticsEvento.aggregate([
      {
        $match: {
          tipo:      "product_view",
          producto:  { $in: productosIds },
          timestamp: { $gte: inicio, $lte: fin },
        },
      },
      { $group: { _id: null, total: { $sum: 1 } } },
    ]),

    // Ventas de sus productos
    Orden.aggregate([
      {
        $match: {
          estado:   { $in: ["pagado", "enviado", "entregado"] },
          creadoEn: { $gte: inicio, $lte: fin },
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.snapshotProducto.vendedorId": vid,
        },
      },
      {
        $group: {
          _id:      null,
          ventas:   { $sum: "$items.cantidad" },
          ingresos: { $sum: "$items.subtotal" },
          ordenes:  { $addToSet: "$_id" },
        },
      },
    ]),

    // Período anterior para comparación
    Orden.aggregate([
      {
        $match: {
          estado:   { $in: ["pagado", "enviado", "entregado"] },
          creadoEn: {
            $gte: new Date(inicio.getTime() - (fin - inicio)),
            $lte: inicio,
          },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.snapshotProducto.vendedorId": vid } },
      {
        $group: {
          _id:      null,
          ingresos: { $sum: "$items.subtotal" },
          ventas:   { $sum: "$items.cantidad" },
        },
      },
    ]),
  ]);

  const ingresosActual  = ventas[0]?.ingresos   || 0;
  const ingresosAnterior = periodoAnterior[0]?.ingresos || 0;
  const crecimiento     = ingresosAnterior > 0
    ? (((ingresosActual - ingresosAnterior) / ingresosAnterior) * 100).toFixed(1)
    : null;

  return {
    vistas:    vistas[0]?.total  || 0,
    ventas:    ventas[0]?.ventas || 0,
    ordenes:   ventas[0]?.ordenes?.length || 0,
    ingresos:  Math.round(ingresosActual),
    crecimiento: crecimiento !== null ? parseFloat(crecimiento) : null,
    totalProductos: productosIds.length,
  };
}

// ─────────────────────────────────────────────
//  7. TOP BÚSQUEDAS — para tabla de insights
// ─────────────────────────────────────────────
async function topBusquedas(inicio, fin, limite = 20) {
  return AnalyticsEvento.aggregate([
    {
      $match: {
        tipo:      "search",
        timestamp: { $gte: inicio, $lte: fin },
        "datos.query": { $exists: true, $ne: "" },
      },
    },
    {
      $group: {
        _id:          "$datos.query",
        count:        { $sum: 1 },
        sinResultados: {
          $sum: { $cond: [{ $eq: ["$datos.resultados", 0] }, 1, 0] },
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limite },
    {
      $project: {
        query:         "$_id",
        count:         1,
        sinResultados: 1,
        _id:           0,
      },
    },
  ]);
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  rangoFechas,
  rangoPersonalizado,
  kpisPrincipales,
  tendenciaDiaria,
  topProductos,
  topCategorias,
  productAnalytics,
  vendedorAnalytics,
  topBusquedas,
};

/**
 * ConnectModa – Procesador de Cola de Reportes
 * Genera reportes PDF y Excel bajo demanda
 * Guarda en S3 (o disco local como fallback) y notifica al usuario
 *
 * Tipos de reporte:
 *   ventas_vendedor   → Resumen de ventas del taller
 *   ordenes_admin     → Listado de órdenes para admin
 *   productos_admin   → Inventario de productos
 *   analytics_admin   → Métricas de la plataforma
 *
 * Mejoras v2:
 *  - S3Client como singleton (reusar entre jobs)
 *  - generarReporteProductosAdmin() implementado (faltaba en v1, solo
 *    estaba declarado en el objeto GENERADORES pero no definido)
 *  - Sanitizar nombre de archivo antes de guardar en disco (path traversal)
 *  - Límite de 500 órdenes en reporte con advertencia explícita en el PDF
 *  - Tablas con paginación automática (addPage cuando se acerca al borde)
 */

const path        = require("path");
const fs          = require("fs");
const os          = require("os");
const PDFDocument = require("pdfkit");
const { reportQueue, emailQueue, encolar } = require("../../utils/queues");
const Orden       = require("../../models/Orden");
const Producto    = require("../../models/Producto");

// ─────────────────────────────────────────────
//  S3 SINGLETON
// ─────────────────────────────────────────────
let _s3 = null;

function getS3() {
  if (_s3) return _s3;
  try {
    const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
    _s3 = {
      client: new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }),
      PutObjectCommand,
      bucket: process.env.AWS_S3_BUCKET || "connectmoda-reportes",
    };
    return _s3;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function formatCOP(n) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0,
  }).format(n || 0);
}

function formatFecha(d) {
  return new Date(d).toLocaleDateString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/**
 * Sanitizar nombre de archivo para evitar path traversal.
 * MEJORA: eliminar cualquier caracter que no sea alfanumérico, guion o punto.
 */
function sanitizarNombreArchivo(nombre) {
  return nombre.replace(/[^a-zA-Z0-9_\-.]/g, "_").substring(0, 100);
}

/** Subir archivo a S3 o guardarlo localmente como fallback */
async function guardarArchivo(buffer, nombreArchivo, contentType) {
  const s3 = getS3();

  if (s3) {
    try {
      const key = `reportes/${Date.now()}_${sanitizarNombreArchivo(nombreArchivo)}`;
      await s3.client.send(
        new s3.PutObjectCommand({
          Bucket:      s3.bucket,
          Key:         key,
          Body:        buffer,
          ContentType: contentType,
        })
      );
      const cdn = process.env.AWS_CLOUDFRONT_URL || `https://${s3.bucket}.s3.amazonaws.com`;
      return { url: `${cdn}/${key}`, tipo: "s3" };
    } catch (errS3) {
      log("warn", "s3_fallback", { error: errS3.message });
    }
  }

  // Fallback: guardar en disco temporal
  const tmpDir   = path.join(os.tmpdir(), "connectmoda_reportes");
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, sanitizarNombreArchivo(nombreArchivo));
  fs.writeFileSync(filePath, buffer);

  return {
    url:        filePath,
    tipo:       "local",
    advertencia: "Guardado localmente — configura AWS S3 para producción",
  };
}

// ─────────────────────────────────────────────
//  GENERADORES DE REPORTE
// ─────────────────────────────────────────────

/** Reporte PDF de ventas para un vendedor */
async function generarReporteVentasVendedor({ filtros, usuarioId }) {
  const { desde, hasta } = filtros || {};

  const query = {
    "items.snapshotProducto.vendedorId": usuarioId,
    estado: { $in: ["pagado", "enviado", "entregado"] },
  };
  if (desde || hasta) {
    query.creadoEn = {};
    if (desde) query.creadoEn.$gte = new Date(desde);
    if (hasta) query.creadoEn.$lte = new Date(hasta);
  }

  const ordenes = await Orden.find(query).lean();

  let totalIngresos = 0;
  let totalUnidades = 0;
  const porCategoria = {};
  const porProducto  = {};

  for (const orden of ordenes) {
    for (const item of orden.items || []) {
      if (item.snapshotProducto?.vendedorId?.toString() !== usuarioId.toString()) continue;
      totalIngresos += item.subtotal || 0;
      totalUnidades += item.cantidad || 0;

      const cat    = item.snapshotProducto?.categoria || "Sin categoría";
      porCategoria[cat] = (porCategoria[cat] || 0) + (item.subtotal || 0);

      const nombre = item.snapshotProducto?.nombre || "Producto";
      if (!porProducto[nombre]) porProducto[nombre] = { unidades: 0, ingresos: 0 };
      porProducto[nombre].unidades += item.cantidad || 0;
      porProducto[nombre].ingresos += item.subtotal || 0;
    }
  }

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];

    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(24).font("Helvetica-Bold").text("ConnectModa", { align: "center" });
    doc.fontSize(16).font("Helvetica").text("Reporte de Ventas", { align: "center" });
    doc.fontSize(11).fillColor("#888").text(`Generado: ${new Date().toLocaleString("es-CO")}`, { align: "center" });
    if (desde || hasta) {
      doc.text(`Período: ${desde ? formatFecha(desde) : "inicio"} – ${hasta ? formatFecha(hasta) : "hoy"}`, { align: "center" });
    }
    doc.moveDown(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e0d8c8").moveDown();

    doc.fillColor("#000").fontSize(14).font("Helvetica-Bold").text("RESUMEN EJECUTIVO");
    doc.moveDown(0.5);
    const resumenY = doc.y;
    doc.fontSize(11).font("Helvetica");
    [
      ["Total órdenes",     ordenes.length.toString()],
      ["Ingresos totales",  formatCOP(totalIngresos)],
      ["Unidades vendidas", totalUnidades.toString()],
      ["Ticket promedio",   ordenes.length ? formatCOP(totalIngresos / ordenes.length) : "$0"],
    ].forEach(([label, valor], i) => {
      doc.text(label + ":", 50, resumenY + i * 18).text(valor, 200, resumenY + i * 18);
    });

    doc.moveDown(3.5);

    doc.fontSize(14).font("Helvetica-Bold").text("TOP PRODUCTOS");
    doc.moveDown(0.5);
    const topProd = Object.entries(porProducto)
      .sort(([, a], [, b]) => b.ingresos - a.ingresos)
      .slice(0, 10);

    doc.fontSize(9).fillColor("#888");
    ["PRODUCTO", "UNIDADES", "INGRESOS"].forEach((h, i) => {
      doc.text(h, [50, 350, 450][i], doc.y);
    });
    doc.moveDown(0.3).moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc").moveDown(0.3);

    doc.fillColor("#000").fontSize(10).font("Helvetica");
    topProd.forEach(([nombre, d]) => {
      // MEJORA: paginación automática
      if (doc.y > 720) doc.addPage();
      const y = doc.y;
      doc.text(nombre.substring(0, 38), 50, y)
        .text(d.unidades.toString(), 350, y)
        .text(formatCOP(d.ingresos), 430, y);
      doc.moveDown(0.5);
    });

    doc.end();
  });
}

/** Reporte PDF de órdenes para admin */
async function generarReporteOrdenesAdmin({ filtros }) {
  const { desde, hasta, estado } = filtros || {};
  const query = {};
  if (estado) query.estado = estado;
  if (desde || hasta) {
    query.creadoEn = {};
    if (desde) query.creadoEn.$gte = new Date(desde);
    if (hasta) query.creadoEn.$lte = new Date(hasta);
  }

  const ordenes = await Orden.find(query)
    .populate("usuario", "nombre email")
    .sort({ creadoEn: -1 })
    .limit(500)
    .lean();

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" });
    const chunks = [];

    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text("ConnectModa – Reporte de Órdenes", { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#888")
      .text(`${ordenes.length} órdenes · Generado: ${new Date().toLocaleString("es-CO")}`, { align: "center" });
    // MEJORA: advertir si se alcanzó el límite de 500
    if (ordenes.length === 500) {
      doc.fontSize(9).fillColor("#e8420a")
        .text("⚠  Se muestran las últimas 500 órdenes. Usa filtros de fecha para mayor detalle.", { align: "center" });
    }
    doc.moveDown().moveTo(50, doc.y).lineTo(780, doc.y).stroke("#e0d8c8").moveDown();

    const cols    = [50, 180, 310, 430, 530, 660];
    const headers = ["ORDEN", "USUARIO", "FECHA", "ESTADO", "TOTAL", "ITEMS"];
    doc.fontSize(9).fillColor("#888");
    headers.forEach((h, i) => doc.text(h, cols[i], doc.y));
    doc.moveDown(0.3).moveTo(50, doc.y).lineTo(780, doc.y).stroke("#ccc").moveDown(0.3);

    doc.fillColor("#000").fontSize(9).font("Helvetica");
    ordenes.forEach((o) => {
      // MEJORA: margen inferior más generoso para landscape
      if (doc.y > 520) doc.addPage();
      const y = doc.y;
      doc.text(o._id.toString().slice(-8),         cols[0], y)
        .text((o.usuario?.nombre || "—").substring(0, 18), cols[1], y)
        .text(formatFecha(o.creadoEn),             cols[2], y)
        .text(o.estado,                            cols[3], y)
        .text(formatCOP(o.total?.total),           cols[4], y)
        .text((o.items?.length || 0).toString(),   cols[5], y);
      doc.moveDown(0.4);
    });

    doc.end();
  });
}

/**
 * Reporte PDF de inventario de productos para admin/emprendedor
 * MEJORA: era solo un stub en v1 — aquí está implementado completamente
 */
async function generarReporteProductosAdmin({ filtros, usuarioId }) {
  const { categoria, soloActivos = true } = filtros || {};

  const query = {};
  if (soloActivos) query.activo = true;
  if (categoria) query.categoria = categoria;
  // Si es emprendedor, solo sus propios productos
  if (usuarioId) query.vendedor = usuarioId;

  const productos = await Producto.find(query)
    .select("nombre categoria precio stock activo rating.totalVentas creadoEn")
    .sort({ categoria: 1, nombre: 1 })
    .limit(1000)
    .lean();

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" });
    const chunks = [];

    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text("ConnectModa – Inventario de Productos", { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#888")
      .text(`${productos.length} productos · Generado: ${new Date().toLocaleString("es-CO")}`, { align: "center" });
    doc.moveDown().moveTo(50, doc.y).lineTo(780, doc.y).stroke("#e0d8c8").moveDown();

    const cols    = [50, 230, 350, 430, 510, 600, 690];
    const headers = ["NOMBRE", "CATEGORÍA", "PRECIO", "STOCK", "VENTAS", "ESTADO", "CREADO"];
    doc.fontSize(9).fillColor("#888");
    headers.forEach((h, i) => doc.text(h, cols[i], doc.y));
    doc.moveDown(0.3).moveTo(50, doc.y).lineTo(780, doc.y).stroke("#ccc").moveDown(0.3);

    doc.fillColor("#000").fontSize(9).font("Helvetica");

    let categoriaActual = null;
    for (const p of productos) {
      if (doc.y > 520) doc.addPage();

      // Separador de categoría
      if (p.categoria !== categoriaActual) {
        categoriaActual = p.categoria;
        doc.moveDown(0.3)
          .fontSize(8).fillColor("#888")
          .text(`— ${(p.categoria || "Sin categoría").toUpperCase()} —`, 50, doc.y);
        doc.fillColor("#000").fontSize(9);
        doc.moveDown(0.3);
      }

      const y = doc.y;
      doc.text(p.nombre.substring(0, 22),      cols[0], y)
        .text((p.categoria || "—").substring(0, 14), cols[1], y)
        .text(formatCOP(p.precio),             cols[2], y)
        .text(String(p.stock ?? 0),            cols[3], y)
        .text(String(p.rating?.totalVentas ?? 0), cols[4], y)
        .text(p.activo ? "Activo" : "Inactivo", cols[5], y)
        .text(formatFecha(p.creadoEn),         cols[6], y);
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

// ─────────────────────────────────────────────
//  DISPATCHER
// ─────────────────────────────────────────────
const GENERADORES = {
  ventas_vendedor: generarReporteVentasVendedor,
  ordenes_admin:   generarReporteOrdenesAdmin,
  productos_admin: generarReporteProductosAdmin,  // MEJORA: ya implementado
};

async function procesarReporte(job) {
  const { tipo, usuario, filtros } = job.data;

  log("info", "iniciando", { jobId: job.id, tipo, usuarioId: usuario?.id });

  await job.progress(5);

  const generador = GENERADORES[tipo];
  if (!generador) throw new Error(`Tipo de reporte desconocido: "${tipo}"`);

  await job.progress(20);
  const buffer        = await generador({ filtros, usuarioId: usuario?.id });
  const nombreArchivo = `reporte_${tipo}_${Date.now()}.pdf`;

  await job.progress(70);

  const { url, tipo: ubicacion, advertencia } = await guardarArchivo(buffer, nombreArchivo, "application/pdf");

  await job.progress(85);

  log("info", "guardado", { jobId: job.id, tipo, ubicacion, bytes: buffer.length, url: url?.substring(0, 80) });
  if (advertencia) log("warn", "advertencia", { jobId: job.id, advertencia });

  // Notificar al usuario por email
  await encolar(emailQueue, "report:ready", {
    tipo:    "report:ready",
    usuario: { email: usuario.email, nombre: usuario.nombre },
    datos:   { reporte: { tipo, url } },
  });

  await job.progress(100);

  return { url, tipo, bytes: buffer.length, ubicacion };
}

// ─────────────────────────────────────────────
//  REGISTRAR PROCESADOR
// ─────────────────────────────────────────────
function iniciar() {
  if (!reportQueue) {
    log("warn", "cola_deshabilitada", { cola: "reportQueue" });
    return;
  }

  // Concurrencia 1 — los reportes son muy pesados en CPU/memoria
  reportQueue.process(1, async (job) => {
    try {
      return await procesarReporte(job);
    } catch (err) {
      log("error", "error_procesando", {
        jobId:   job.id,
        error:   err.message,
        intento: job.attemptsMade,
      });
      throw err;
    }
  });

  log("info", "procesador_iniciado", { cola: "reportQueue", concurrencia: 1 });
}

function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "ReportProcessor",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

module.exports = { iniciar, procesarReporte };

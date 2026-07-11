/**
 * ConnectModa – Controller de Pagos
 * Integración Wompi (Bancolombia) — PSE, Nequi, Tarjeta, Bancolombia Transfer
 */

const mongoose    = require("mongoose");
const PDFDocument = require("pdfkit");

const {
  crearTransaccion,
  consultarTransaccion,
  consultarPorReferencia,
  obtenerBancosPSE,
  mapearEstado,
  formatearCOP,
  centavosACOP,
  PUBLIC_KEY,
} = require("../utils/wompi");

const { enviarConfirmacionPago, enviarNotificacionPagoFallido } = require("../utils/email");

const Orden       = require("../models/Orden");
const Transaccion = require("../models/Transaccion");

// ─── Logger estructurado ──────────────────────────────────────────────────────

function log(nivel, accion, datos = {}) {
  const entrada = { ts: new Date().toISOString(), nivel, modulo: "PagoController", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entrada)) : console.log(JSON.stringify(entrada));
}

// ─── Generar referencia única por orden ───────────────────────────────────────

function generarReferencia(ordenId) {
  const ts = Date.now().toString(36).toUpperCase();
  return `CM-${ordenId.toString().slice(-6).toUpperCase()}-${ts}`;
}

// ─────────────────────────────────────────────
//  1. INICIAR PAGO — POST /api/pagos/iniciar
//     Retorna datos para el widget Wompi + referencia
// ─────────────────────────────────────────────

const iniciarPago = async (req, res) => {
  try {
    const usuarioId = req.usuario._id;
    const { ordenId } = req.body;

    if (!ordenId || !mongoose.Types.ObjectId.isValid(ordenId)) {
      return res.status(400).json({ ok: false, mensaje: "ordenId inválido o faltante" });
    }

    const orden = await Orden.findById(ordenId).populate("usuario", "nombre email");
    if (!orden) return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });

    if (orden.usuario._id.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "Esta orden no te pertenece" });
    }
    if (orden.estado !== "pendiente") {
      return res.status(400).json({
        ok: false,
        mensaje: `No se puede pagar una orden en estado "${orden.estado}". Solo órdenes pendientes.`,
      });
    }

    // Verificar si ya hay una transacción pendiente para esta orden
    const txExistente = await Transaccion.findOne({
      orden:  ordenId,
      estado: { $in: ["creado", "procesando"] },
    });

    if (txExistente) {
      return res.status(200).json({
        ok:              true,
        referencia:      txExistente.referencia,
        montoCentavos:   txExistente.montoCentavos,
        montoFormateado: formatearCOP(txExistente.montoCOP),
        wompiPublicKey:  PUBLIC_KEY,
        mensaje:         "Transacción pendiente reutilizada",
      });
    }

    // Crear referencia y registrar en BD (el cargo real lo hace el widget en el frontend)
    const referencia     = generarReferencia(ordenId);
    const montoCentavos  = Math.round(orden.total.total * 100);

    await Transaccion.create({
      orden:         ordenId,
      usuario:       usuarioId,
      referencia,
      montoCOP:      orden.total.total,
      montoCentavos,
      moneda:        "COP",
      estado:        "creado",
      ipCliente:     req.ip,
      userAgent:     req.headers["user-agent"]?.substring(0, 200),
      eventos: [{ tipo: "pago.iniciado", datos: { referencia } }],
    });

    log("info", "pago_iniciado", { referencia, ordenId, montoCOP: orden.total.total });

    return res.status(201).json({
      ok:             true,
      referencia,
      montoCentavos,
      montoFormateado: formatearCOP(orden.total.total),
      wompiPublicKey:  PUBLIC_KEY,
      // El frontend usa estos datos para inicializar el widget de Wompi
    });
  } catch (error) {
    log("error", "iniciarPago", { error: error.message });
    return res.status(500).json({
      ok: false,
      mensaje: "Error al iniciar el pago",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────
//  2. CONFIRMAR PAGO — POST /api/pagos/confirmar
//     El frontend envía el wompiTransactionId tras completar el widget
// ─────────────────────────────────────────────

const confirmarPago = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const usuarioId           = req.usuario._id;
    const { wompiTransactionId, referencia } = req.body;

    if (!wompiTransactionId || !referencia) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje: "wompiTransactionId y referencia son requeridos" });
    }

    // Consultar estado real en Wompi
    const txWompi = await consultarTransaccion(wompiTransactionId);

    // Buscar transacción local por referencia
    const tx = await Transaccion.findOne({ referencia }).session(session);
    if (!tx) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, mensaje: "Transacción no encontrada para esta referencia" });
    }

    // Anti-fraude: verificar que el monto coincida
    if (txWompi.amount_in_cents !== tx.montoCentavos) {
      log("error", "monto_no_coincide", {
        esperado: tx.montoCentavos,
        recibido: txWompi.amount_in_cents,
        referencia,
      });
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje: "El monto del pago no coincide con la orden" });
    }

    const estadoInterno = mapearEstado(txWompi.status);
    const orden         = await Orden.findById(tx.orden).populate("usuario", "nombre email").session(session);

    if (!orden) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });
    }

    if (txWompi.status === "APPROVED") {
      // Idempotencia
      if (orden.estado !== "pagado") {
        const estadoAnterior = orden.estado;
        orden.estado = "pagado";
        orden.registrarCambioEstado(estadoAnterior, "pagado", usuarioId, `Wompi: ${wompiTransactionId}`);
        await orden.save({ session });
      }

      await Transaccion.findByIdAndUpdate(
        tx._id,
        {
          estado:             estadoInterno,
          wompiTransactionId,
          metodoPago:         txWompi.payment_method_type,
          $push: { eventos: { tipo: "pago.aprobado", datos: { status: txWompi.status, wompiId: wompiTransactionId } } },
        },
        { session }
      );

      await session.commitTransaction();

      // Email fuera de la transacción
      await enviarConfirmacionPago(orden.usuario.email, {
        nombre:      orden.usuario.nombre,
        numeroOrden: orden._id.toString(),
        total:       orden.total.total,
        items:       orden.items,
        tracking:    orden.numero_seguimiento || null,
      });

      log("info", "pago_aprobado", { referencia, wompiTransactionId, monto: orden.total.total });

      return res.status(200).json({
        ok: true,
        mensaje: "Pago procesado exitosamente",
        orden: { id: orden._id, estado: orden.estado, total: formatearCOP(orden.total.total) },
      });

    } else {
      // DECLINED, ERROR, VOIDED
      const motivo = txWompi.status_message || "Pago no aprobado";

      await Transaccion.findByIdAndUpdate(
        tx._id,
        {
          estado:        estadoInterno,
          wompiTransactionId,
          errorMensaje:  motivo,
          $push: { eventos: { tipo: "pago.fallido", datos: { status: txWompi.status } } },
        },
        { session }
      );

      await session.commitTransaction();

      await enviarNotificacionPagoFallido(orden.usuario.email, {
        nombre:      orden.usuario.nombre,
        numeroOrden: orden._id.toString(),
        motivo,
      });

      log("warn", "pago_fallido", { referencia, status: txWompi.status, motivo });

      return res.status(402).json({
        ok:      false,
        mensaje: "El pago no fue aprobado",
        detalle: motivo,
        status:  txWompi.status,
      });
    }
  } catch (error) {
    await session.abortTransaction();
    log("error", "confirmarPago", { error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al confirmar el pago" });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  3. LISTAR PAGOS (Admin) — GET /api/pagos
// ─────────────────────────────────────────────

const listarPagos = async (req, res) => {
  try {
    if (!["admin", "emprendedor"].includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, mensaje: "Acceso restringido" });
    }

    const pagina  = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite  = Math.min(100, Math.max(1, parseInt(req.query.limite) || 20));
    const skip    = (pagina - 1) * limite;
    const filtro  = {};

    if (req.query.estado)  filtro.estado  = req.query.estado;
    if (req.query.usuario) filtro.usuario = req.query.usuario;
    if (req.query.desde || req.query.hasta) {
      filtro.creadoEn = {};
      if (req.query.desde) filtro.creadoEn.$gte = new Date(req.query.desde);
      if (req.query.hasta) filtro.creadoEn.$lte = new Date(req.query.hasta);
    }

    const [transacciones, total] = await Promise.all([
      Transaccion.find(filtro)
        .select("-eventos -userAgent")
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limite)
        .populate("usuario", "nombre email")
        .populate("orden", "estado total.total")
        .lean(),
      Transaccion.countDocuments(filtro),
    ]);

    const stats = await Transaccion.aggregate([
      { $match: filtro },
      { $group: { _id: "$estado", count: { $sum: 1 }, totalCOP: { $sum: "$montoCOP" } } },
    ]);

    return res.status(200).json({
      ok: true,
      transacciones,
      total,
      pagina,
      paginas:      Math.ceil(total / limite),
      perPagina:    limite,
      estadisticas: stats,
    });
  } catch (error) {
    log("error", "listarPagos", { error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al listar pagos" });
  }
};

// ─────────────────────────────────────────────
//  4. BANCOS PSE — GET /api/pagos/bancos-pse
// ─────────────────────────────────────────────

const listarBancosPSE = async (req, res) => {
  try {
    const bancos = await obtenerBancosPSE();
    return res.status(200).json({ ok: true, bancos });
  } catch (error) {
    log("error", "listarBancosPSE", { error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener bancos PSE" });
  }
};

// ─────────────────────────────────────────────
//  5. RECIBO PDF — GET /api/pagos/recibo/:ordenId
// ─────────────────────────────────────────────

const obtenerReciboPago = async (req, res) => {
  try {
    const { ordenId } = req.params;
    const usuarioId   = req.usuario._id;
    const esAdmin     = ["admin", "emprendedor"].includes(req.usuario.rol);

    if (!mongoose.Types.ObjectId.isValid(ordenId)) {
      return res.status(400).json({ ok: false, mensaje: "ordenId inválido" });
    }

    const orden = await Orden.findById(ordenId)
      .populate("usuario", "nombre email")
      .populate("items.producto", "nombre");

    if (!orden) return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });
    if (!esAdmin && orden.usuario._id.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "No tienes acceso a este recibo" });
    }
    if (!["pagado", "enviado", "entregado"].includes(orden.estado)) {
      return res.status(400).json({ ok: false, mensaje: "Solo se puede generar recibo de órdenes pagadas" });
    }

    const tx = await Transaccion.findOne({ orden: ordenId, estado: "exitoso" });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="recibo-${ordenId}.pdf"`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(22).font("Helvetica-Bold").text("ConnectModa", { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#666").text("Recibo de pago", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e0d8c8");
    doc.moveDown();

    // Datos de la orden
    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold").text("DETALLES DE LA ORDEN");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10)
      .text(`Número de orden: ${orden._id}`)
      .text(`Fecha: ${new Date(orden.creadoEn).toLocaleDateString("es-CO")}`)
      .text(`Estado: ${orden.estado.toUpperCase()}`)
      .text(`Comprador: ${orden.usuario.nombre}`)
      .text(`Email: ${orden.usuario.email}`);
    if (tx?.referencia)          doc.text(`Referencia Wompi: ${tx.referencia}`);
    if (tx?.wompiTransactionId)  doc.text(`ID de transacción: ${tx.wompiTransactionId}`);
    if (tx?.metodoPago)          doc.text(`Método de pago: ${tx.metodoPago}`);
    doc.moveDown();

    // Dirección
    doc.font("Helvetica-Bold").text("DIRECCIÓN DE ENVÍO");
    doc.font("Helvetica").moveDown(0.3)
      .text(`${orden.direccion_envio.calle} ${orden.direccion_envio.numero || ""}`)
      .text(`${orden.direccion_envio.ciudad}, ${orden.direccion_envio.pais}`);
    if (orden.direccion_envio.cp) doc.text(`CP: ${orden.direccion_envio.cp}`);
    doc.moveDown();

    // Tabla de items
    doc.font("Helvetica-Bold").text("PRODUCTOS");
    doc.moveDown(0.3);
    const tableTop = doc.y;
    doc.fontSize(9).font("Helvetica").fillColor("#666")
      .text("PRODUCTO", 50, tableTop)
      .text("CANT.", 350, tableTop)
      .text("P. UNIT.", 400, tableTop)
      .text("SUBTOTAL", 470, tableTop);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc");
    doc.moveDown(0.3);

    doc.fillColor("#000").fontSize(10);
    for (const item of orden.items) {
      const yPos   = doc.y;
      const nombre = item.snapshotProducto?.nombre || "Producto";
      doc.font("Helvetica")
        .text(nombre.substring(0, 40), 50, yPos)
        .text(String(item.cantidad), 350, yPos)
        .text(formatearCOP(item.precioUnitario), 390, yPos)
        .text(formatearCOP(item.subtotal), 465, yPos);
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e0d8c8");
    doc.moveDown(0.5);

    // Totales
    const totalesY = doc.y;
    doc.font("Helvetica").fontSize(10)
      .text("Subtotal:", 380, totalesY).text(formatearCOP(orden.total.subtotal), 465, totalesY)
      .text("IVA (19%):", 380, totalesY + 16).text(formatearCOP(orden.total.impuestos), 465, totalesY + 16)
      .text("Envío:", 380, totalesY + 32).text(formatearCOP(orden.total.envio), 465, totalesY + 32);

    doc.font("Helvetica-Bold").fontSize(12)
      .text("TOTAL:", 380, totalesY + 54).text(formatearCOP(orden.total.total), 455, totalesY + 54);

    doc.moveDown(4);
    doc.fontSize(8).font("Helvetica").fillColor("#999")
      .text("Este documento es un comprobante de pago emitido por ConnectModa.", { align: "center" })
      .text("Para soporte escribe a soporte@connectmoda.co", { align: "center" });

    doc.end();
    log("info", "recibo_generado", { ordenId, usuarioId: usuarioId.toString() });
  } catch (error) {
    log("error", "obtenerReciboPago", { error: error.message });
    if (!res.headersSent) res.status(500).json({ ok: false, mensaje: "Error al generar el recibo" });
  }
};

module.exports = {
  iniciarPago,
  confirmarPago,
  listarPagos,
  listarBancosPSE,
  obtenerReciboPago,
};

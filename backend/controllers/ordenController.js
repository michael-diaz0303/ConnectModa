/**
 * ConnectModa – Controller de Órdenes
 * CRUD completo con validaciones, transacciones y auditoría
 */

const mongoose = require("mongoose");
const Orden    = require("../models/Orden");
const Producto = require("../models/Producto");
const {
  calcularTotales,
  generarNumeroSeguimiento,
  calcularFechaEstimadaEntrega,
  validarTransicionEstado,
} = require("../middleware/ordenLogica");

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Devuelve el carrito del usuario (se asume modelo de Carrito separado o campo en Usuario).
 *  Adaptar según tu implementación de carrito. */
async function obtenerCarritoUsuario(usuarioId) {
  // Ejemplo: si tienes un modelo Carrito
  // const Carrito = require("../models/Carrito");
  // return Carrito.findOne({ usuario: usuarioId }).populate("items.producto");

  // ── MOCK para testing ─────────────────────────────────────────
  // Reemplaza esto con tu lógica real de carrito
  throw new Error("Implementa obtenerCarritoUsuario() con tu modelo de Carrito");
}

async function vaciarCarrito(usuarioId, session) {
  // const Carrito = require("../models/Carrito");
  // await Carrito.findOneAndUpdate({ usuario: usuarioId }, { items: [] }, { session });
}

// ─────────────────────────────────────────────
//  1. CREAR ORDEN — POST /api/ordenes
// ─────────────────────────────────────────────
const crearOrden = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const usuarioId = req.usuario._id; // Viene del middleware de auth
    const { metodo_pago, direccion_envio, notas } = req.body;

    // ── Validar campos requeridos ─────────────────────────────
    if (!metodo_pago || !direccion_envio?.calle || !direccion_envio?.ciudad) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        mensaje: "metodo_pago y dirección de envío (calle, ciudad) son obligatorios",
      });
    }

    if (!Orden.METODOS_PAGO.includes(metodo_pago)) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        mensaje: `Método de pago inválido. Opciones: ${Orden.METODOS_PAGO.join(", ")}`,
      });
    }

    // ── Obtener y validar carrito ─────────────────────────────
    let carrito;
    try {
      carrito = await obtenerCarritoUsuario(usuarioId);
    } catch (e) {
      await session.abortTransaction();
      return res.status(500).json({ ok: false, mensaje: e.message });
    }

    if (!carrito?.items?.length) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje: "El carrito está vacío" });
    }

    // ── Validar stock y construir items ───────────────────────
    const productosIds = carrito.items.map((i) => i.producto._id || i.producto);
    const productos = await Producto.find({ _id: { $in: productosIds } }).session(session);
    const productoMap = new Map(productos.map((p) => [p._id.toString(), p]));

    const itemsOrden = [];
    const erroresStock = [];

    for (const item of carrito.items) {
      const pId = (item.producto._id || item.producto).toString();
      const producto = productoMap.get(pId);

      if (!producto) {
        erroresStock.push(`Producto ${pId} no encontrado`);
        continue;
      }
      if (!producto.activo) {
        erroresStock.push(`"${producto.nombre}" ya no está disponible`);
        continue;
      }
      if (producto.stock < item.cantidad) {
        erroresStock.push(
          `"${producto.nombre}": stock insuficiente (disponible: ${producto.stock}, solicitado: ${item.cantidad})`
        );
      } else {
        itemsOrden.push({
          producto: producto._id,
          cantidad: item.cantidad,
          precioUnitario: producto.precio,
          subtotal: 0, // Se calcula abajo
          snapshotProducto: {
            nombre: producto.nombre,
            imagen: producto.imagenes?.[0] || null,
            vendedorId: producto.vendedor.id,
            vendedorNombre: producto.vendedor.nombre,
          },
        });
      }
    }

    if (erroresStock.length) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        mensaje: "Problemas con el stock de algunos productos",
        errores: erroresStock,
      });
    }

    // ── Calcular totales ──────────────────────────────────────
    const totales = calcularTotales(itemsOrden, direccion_envio.ciudad);

    // ── Crear la orden ────────────────────────────────────────
    const [orden] = await Orden.create(
      [
        {
          usuario: usuarioId,
          items: itemsOrden,
          total: totales,
          estado: "pendiente",
          metodo_pago,
          direccion_envio,
          notas: notas || "",
          historialEstados: [
            {
              estadoAnterior: null,
              estadoNuevo: "pendiente",
              cambiadoPor: usuarioId,
              nota: "Orden creada",
            },
          ],
        },
      ],
      { session }
    );

    // ── Reducir stock ─────────────────────────────────────────
    const bulkOps = itemsOrden.map((item) => ({
      updateOne: {
        filter: { _id: item.producto },
        update: { $inc: { stock: -item.cantidad } },
      },
    }));
    await Producto.bulkWrite(bulkOps, { session });

    // ── Vaciar carrito ────────────────────────────────────────
    await vaciarCarrito(usuarioId, session);

    // ── Commit transacción ────────────────────────────────────
    await session.commitTransaction();

    return res.status(201).json({
      ok: true,
      mensaje: "Orden creada exitosamente",
      orden: await orden.populate("items.producto", "nombre imagenes precio"),
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[OrdenController] crearOrden:", error.message);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al crear la orden",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  2. LISTAR ÓRDENES — GET /api/ordenes
// ─────────────────────────────────────────────
const obtenerOrdenes = async (req, res) => {
  try {
    const usuarioId = req.usuario._id;
    const esAdmin   = ["admin", "emprendedor"].includes(req.usuario.rol);

    // ── Paginación ────────────────────────────────────────────
    let pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    let limite = Math.min(50, Math.max(1, parseInt(req.query.limite) || 10));
    const skip = (pagina - 1) * limite;

    // ── Filtros ───────────────────────────────────────────────
    const filtro = {};

    // Admin ve todas las órdenes; usuario normal solo las suyas
    if (!esAdmin) filtro.usuario = usuarioId;

    if (req.query.estado && Orden.ESTADOS.includes(req.query.estado)) {
      filtro.estado = req.query.estado;
    }

    // ── Ejecutar consulta ─────────────────────────────────────
    const [ordenes, total] = await Promise.all([
      Orden.find(filtro)
        .select("-historialEstados -notas")
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limite)
        .populate("usuario", "nombre email")
        .lean(),
      Orden.countDocuments(filtro),
    ]);

    return res.status(200).json({
      ok: true,
      ordenes,
      total,
      pagina,
      paginas: Math.ceil(total / limite),
      perPagina: limite,
    });
  } catch (error) {
    console.error("[OrdenController] obtenerOrdenes:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al obtener órdenes" });
  }
};

// ─────────────────────────────────────────────
//  3. DETALLE ORDEN — GET /api/ordenes/:id
// ─────────────────────────────────────────────
const obtenerOrdenPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario._id;
    const esAdmin   = ["admin", "emprendedor"].includes(req.usuario.rol);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, mensaje: "ID de orden inválido" });
    }

    const orden = await Orden.findById(id)
      .populate("items.producto", "nombre imagenes precio categoria vendedor")
      .populate("usuario", "nombre email")
      .populate("historialEstados.cambiadoPor", "nombre rol");

    if (!orden) {
      return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });
    }

    // Verificar que la orden pertenece al usuario (o es admin)
    if (!esAdmin && orden.usuario._id.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "No tienes acceso a esta orden" });
    }

    return res.status(200).json({ ok: true, orden });
  } catch (error) {
    console.error("[OrdenController] obtenerOrdenPorId:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al obtener la orden" });
  }
};

// ─────────────────────────────────────────────
//  4. ACTUALIZAR ESTADO — PATCH /api/ordenes/:id
// ─────────────────────────────────────────────
const actualizarEstadoOrden = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id }           = req.params;
    const { estado, nota } = req.body;
    const usuarioId        = req.usuario._id;

    // Solo admin o emprendedor pueden cambiar estado
    if (!["admin", "emprendedor"].includes(req.usuario.rol)) {
      await session.abortTransaction();
      return res.status(403).json({ ok: false, mensaje: "No tienes permisos para cambiar el estado" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje: "ID de orden inválido" });
    }

    const orden = await Orden.findById(id).session(session);
    if (!orden) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });
    }

    // ── Validar transición ────────────────────────────────────
    const { valido, mensaje } = validarTransicionEstado(Orden, orden.estado, estado);
    if (!valido) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje });
    }

    const estadoAnterior = orden.estado;

    // ── Lógica especial por estado destino ────────────────────
    if (estado === "enviado") {
      orden.numero_seguimiento = generarNumeroSeguimiento();
      orden.fecha_estimada_entrega = calcularFechaEstimadaEntrega(
        orden.direccion_envio?.ciudad
      );
    }

    // ── Actualizar estado y registrar auditoría ───────────────
    orden.estado = estado;
    orden.registrarCambioEstado(estadoAnterior, estado, usuarioId, nota || "");

    await orden.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      ok: true,
      mensaje: `Estado actualizado: ${estadoAnterior} → ${estado}`,
      orden,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[OrdenController] actualizarEstadoOrden:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al actualizar el estado" });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  5. CANCELAR ORDEN — POST /api/ordenes/:id/cancelar
// ─────────────────────────────────────────────
const cancelarOrden = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id }     = req.params;
    const usuarioId  = req.usuario._id;
    const { motivo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, mensaje: "ID de orden inválido" });
    }

    const orden = await Orden.findById(id).session(session);

    if (!orden) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, mensaje: "Orden no encontrada" });
    }

    // Solo el dueño o admin puede cancelar
    const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
    if (!esAdmin && orden.usuario.toString() !== usuarioId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ ok: false, mensaje: "No tienes permisos para cancelar esta orden" });
    }

    // Verificar que puede cancelarse
    if (!orden.puedeSerCancelada()) {
      await session.abortTransaction();
      return res.status(400).json({
        ok: false,
        mensaje: `No se puede cancelar una orden en estado "${orden.estado}". Solo se pueden cancelar órdenes en estado: pendiente, procesando`,
      });
    }

    const estadoAnterior = orden.estado;

    // ── Devolver stock a cada producto ────────────────────────
    const bulkOps = orden.items.map((item) => ({
      updateOne: {
        filter: { _id: item.producto },
        update: { $inc: { stock: item.cantidad } },
      },
    }));
    await Producto.bulkWrite(bulkOps, { session });

    // ── Actualizar orden ──────────────────────────────────────
    orden.estado = "cancelado";
    orden.registrarCambioEstado(
      estadoAnterior,
      "cancelado",
      usuarioId,
      motivo || "Cancelada por el usuario"
    );

    await orden.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      ok: true,
      mensaje: "Orden cancelada. El stock ha sido restituido.",
      orden,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[OrdenController] cancelarOrden:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al cancelar la orden" });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  crearOrden,
  obtenerOrdenes,
  obtenerOrdenPorId,
  actualizarEstadoOrden,
  cancelarOrden,
};

// ─────────────────────────────────────────────
//  INTEGRACIÓN CON COLAS — añadir al final de crearOrden()
//  Pegar esto dentro de crearOrden() después de commitTransaction():
//
//  const { emailQueue, analyticsQueue, encolar } = require("../utils/queues");
//  const { invalidarCacheRecomendaciones } = require("./iaController");
//
//  await Promise.allSettled([
//    // Email de confirmación
//    encolar(emailQueue, "order:created", {
//      tipo: "order:created",
//      usuario: { email: orden.usuario.email, nombre: orden.usuario.nombre },
//      datos: { orden: { id: orden._id, items: orden.items.length, total: orden.total.total } },
//    }),
//    // Analytics
//    encolar(analyticsQueue, "order:created", {
//      tipo:      "order:created",
//      usuarioId: usuarioId.toString(),
//      datos: {
//        items: orden.items.map(i => ({
//          productoId: i.producto,
//          categoria:  i.snapshotProducto?.categoria,
//          precio:     i.precioUnitario,
//          cantidad:   i.cantidad,
//        })),
//        total: orden.total.total,
//      },
//    }),
//    // Invalidar caché IA
//    invalidarCacheRecomendaciones(usuarioId),
//  ]);
// ─────────────────────────────────────────────

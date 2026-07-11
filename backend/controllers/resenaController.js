/**
 * ConnectModa – Controller de Reseñas
 * CRUD de reseñas por negocio con moderación y actualización de calificación
 */

const mongoose = require("mongoose");
const Resena   = require("../models/Resena");
const Negocio  = require("../models/Negocio");
const { ok, fail } = require("../utils/apiResponse");

function log(nivel, accion, datos = {}) {
  const e = { ts: new Date().toISOString(), nivel, modulo: "ResenaController", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(e)) : console.log(JSON.stringify(e));
}

// ─── Recalcular valoración promedio del negocio ───────────────────────────────

async function recalcularValoracion(negocioId, session) {
  const resultado = await Resena.aggregate([
    { $match: { negocio: new mongoose.Types.ObjectId(negocioId), aprobada: true } },
    { $group: { _id: null, promedio: { $avg: "$calificacion" }, total: { $sum: 1 } } },
  ]);

  const promedio = resultado[0]?.promedio || 0;
  const total    = resultado[0]?.total    || 0;

  await Negocio.findByIdAndUpdate(
    negocioId,
    { valoracionPromedio: Math.round(promedio * 10) / 10, totalReseñas: total },
    { session }
  );
}

// ─── 1. Crear reseña — POST /api/resenas ──────────────────────────────────────

exports.crear = async (req, res) => {
  try {
    const { negocioId, calificacion, comentario } = req.body;

    if (!mongoose.Types.ObjectId.isValid(negocioId)) {
      return fail(res, "negocioId inválido", 400);
    }

    const negocio = await Negocio.findById(negocioId);
    if (!negocio) return fail(res, "Negocio no encontrado", 404);

    // Un usuario solo puede dejar una reseña por negocio
    const yaReseno = await Resena.findOne({
      negocio: negocioId,
      "autor.correo": req.usuario ? req.usuario.email : null,
    });
    if (yaReseno) return fail(res, "Ya dejaste una reseña para este negocio", 409);

    const resena = await Resena.create({
      negocio:      negocioId,
      autor: {
        nombre: req.usuario?.nombre || req.body.nombre || "Anónimo",
        correo: req.usuario?.email  || req.body.correo || null,
      },
      calificacion,
      comentario,
      aprobada: false, // Requiere moderación
    });

    log("info", "resena_creada", { resenaId: resena._id, negocioId });
    return ok(res, resena, "Reseña enviada. Será visible tras aprobación.", 201);
  } catch (err) {
    log("error", "crear", { error: err.message });
    return fail(res, err.message, 500);
  }
};

// ─── 2. Listar reseñas aprobadas de un negocio — GET /api/resenas/:negocioId ──

exports.listarPorNegocio = async (req, res) => {
  try {
    const { negocioId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(negocioId)) return fail(res, "negocioId inválido", 400);

    const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite = Math.min(50, parseInt(req.query.limite) || 10);
    const skip   = (pagina - 1) * limite;

    const filtro = { negocio: negocioId, aprobada: true };

    // Admin puede ver todas (incluidas no aprobadas)
    if (req.usuario?.rol === "admin") delete filtro.aprobada;

    const [resenas, total] = await Promise.all([
      Resena.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limite).lean(),
      Resena.countDocuments(filtro),
    ]);

    const stats = await Resena.aggregate([
      { $match: { negocio: new mongoose.Types.ObjectId(negocioId), aprobada: true } },
      { $group: {
        _id: "$calificacion",
        cantidad: { $sum: 1 },
      }},
      { $sort: { _id: -1 } },
    ]);

    return ok(res, {
      resenas,
      total,
      pagina,
      paginas:      Math.ceil(total / limite),
      distribucion: stats,
    });
  } catch (err) {
    log("error", "listarPorNegocio", { error: err.message });
    return fail(res, err.message, 500);
  }
};

// ─── 3. Aprobar / rechazar reseña (Admin) — PATCH /api/resenas/:id/moderar ────

exports.moderar = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id }       = req.params;
    const { aprobar }  = req.body; // true = aprobar, false = rechazar

    if (!mongoose.Types.ObjectId.isValid(id)) return fail(res, "ID inválido", 400);

    const resena = await Resena.findByIdAndUpdate(
      id,
      { aprobada: !!aprobar },
      { new: true, session }
    );
    if (!resena) return fail(res, "Reseña no encontrada", 404);

    // Recalcular calificación del negocio
    await recalcularValoracion(resena.negocio, session);

    await session.commitTransaction();

    log("info", aprobar ? "resena_aprobada" : "resena_rechazada", { resenaId: id });
    return ok(res, resena, aprobar ? "Reseña aprobada" : "Reseña rechazada");
  } catch (err) {
    await session.abortTransaction();
    log("error", "moderar", { error: err.message });
    return fail(res, err.message, 500);
  } finally {
    session.endSession();
  }
};

// ─── 4. Eliminar reseña (Admin o autor) — DELETE /api/resenas/:id ─────────────

exports.eliminar = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id }    = req.params;
    const esAdmin   = req.usuario?.rol === "admin";

    if (!mongoose.Types.ObjectId.isValid(id)) return fail(res, "ID inválido", 400);

    const resena = await Resena.findById(id).session(session);
    if (!resena) return fail(res, "Reseña no encontrada", 404);

    // Solo el autor o admin pueden eliminar
    if (!esAdmin && resena.autor.correo !== req.usuario?.email) {
      await session.abortTransaction();
      return fail(res, "No tienes permiso para eliminar esta reseña", 403);
    }

    await resena.deleteOne({ session });
    await recalcularValoracion(resena.negocio, session);
    await session.commitTransaction();

    log("info", "resena_eliminada", { resenaId: id });
    return ok(res, null, "Reseña eliminada correctamente");
  } catch (err) {
    await session.abortTransaction();
    log("error", "eliminar", { error: err.message });
    return fail(res, err.message, 500);
  } finally {
    session.endSession();
  }
};

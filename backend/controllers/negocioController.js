const Negocio     = require('../models/Negocio');
const ApiResponse = require('../utils/apiResponse');
const logger      = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

// ── GET /negocios — Listar con búsqueda y paginación ──────────────────────────
exports.getNegocios = async (req, res, next) => {
  try {
    const {
      page      = 1,
      limit     = 12,
      categoria,
      ciudad,
      busqueda,
      destacado,
      ordenar   = '-createdAt',
    } = req.query;

    const filtro = { activo: true };

    if (categoria)  filtro.categoria          = categoria;
    if (ciudad)     filtro['ubicacion.ciudad'] = new RegExp(ciudad, 'i');
    if (destacado)  filtro.destacado           = destacado === 'true';
    if (busqueda)   filtro.$text              = { $search: busqueda };

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Negocio.countDocuments(filtro);

    const negocios = await Negocio
      .find(filtro)
      .sort(ordenar)
      .skip(skip)
      .limit(parseInt(limit))
      .select('nombre categoria contacto ubicacion imagenes valoracionPromedio totalReseñas destacado');

    res.status(200).json(
      ApiResponse.paginated(negocios, { total, page: parseInt(page), limit: parseInt(limit) })
    );
  } catch (error) {
    next(error);
  }
};

// ── GET /negocios/:id — Obtener negocio por ID ────────────────────────────────
exports.getNegocioById = async (req, res, next) => {
  try {
    const negocio = await Negocio
      .findById(req.params.id)
      .populate({ path: 'resenas', match: { aprobada: true }, options: { limit: 10 } });

    if (!negocio) return next(new AppError('Negocio no encontrado.', 404));

    res.status(200).json(ApiResponse.success(negocio));
  } catch (error) {
    next(error);
  }
};

// ── POST /negocios — Crear negocio ────────────────────────────────────────────
exports.createNegocio = async (req, res, next) => {
  try {
    const negocio = await Negocio.create(req.body);
    logger.info(`Negocio creado: ${negocio._id} – ${negocio.nombre}`);
    res.status(201).json(ApiResponse.created(negocio, 'Negocio registrado exitosamente.'));
  } catch (error) {
    next(error);
  }
};

// ── PUT /negocios/:id — Actualizar negocio ────────────────────────────────────
exports.updateNegocio = async (req, res, next) => {
  try {
    // Evitar modificar campos sensibles directamente
    const camposProhibidos = ['valoracionPromedio', 'totalReseñas'];
    camposProhibidos.forEach(campo => delete req.body[campo]);

    const negocio = await Negocio.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!negocio) return next(new AppError('Negocio no encontrado.', 404));

    logger.info(`Negocio actualizado: ${negocio._id}`);
    res.status(200).json(ApiResponse.success(negocio, 'Negocio actualizado correctamente.'));
  } catch (error) {
    next(error);
  }
};

// ── DELETE /negocios/:id — Eliminar (soft delete) ─────────────────────────────
exports.deleteNegocio = async (req, res, next) => {
  try {
    const negocio = await Negocio.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );

    if (!negocio) return next(new AppError('Negocio no encontrado.', 404));

    logger.info(`Negocio desactivado: ${negocio._id}`);
    res.status(200).json(ApiResponse.success(null, 'Negocio eliminado correctamente.'));
  } catch (error) {
    next(error);
  }
};

// ── GET /negocios/categorias — Listar categorías con conteo ───────────────────
exports.getCategorias = async (req, res, next) => {
  try {
    const categorias = await Negocio.aggregate([
      { $match: { activo: true } },
      { $group: { _id: '$categoria', total: { $sum: 1 } } },
      { $sort:  { total: -1 } },
    ]);
    res.status(200).json(ApiResponse.success(categorias));
  } catch (error) {
    next(error);
  }
};
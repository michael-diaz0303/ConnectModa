/**
 * ConnectModa - Search Controller
 * Sistema de búsqueda avanzada para productos de talleres de ropa
 */

const Producto = require("../models/Producto");
const { sanitizeQuery, buildTextSearch } = require("../middleware/sanitize");

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const LIMITE_DEFAULT = 12;
const LIMITE_MAX = 50;
const ORDENAR_OPCIONES = ["popular", "precioAsc", "precioDesc", "nuevo"];

// ─────────────────────────────────────────────
//  HELPER: construir query de MongoDB
// ─────────────────────────────────────────────
function buildQuery(params) {
  const query = { activo: true }; // Solo productos activos

  // ── Búsqueda de texto (nombre + descripción) ──────────────────
  if (params.q) {
    const textoSanitizado = sanitizeQuery(params.q);
    if (textoSanitizado) {
      query.$text = { $search: textoSanitizado };
    }
  }

  // ── Categoría ─────────────────────────────────────────────────
  if (params.categoria) {
    query.categoria = {
      $regex: new RegExp(`^${sanitizeQuery(params.categoria)}$`, "i"),
    };
  }

  // ── Rango de precio ───────────────────────────────────────────
  const filtroPrecio = {};
  if (params.precioMin !== undefined) {
    const min = parseFloat(params.precioMin);
    if (!isNaN(min) && min >= 0) filtroPrecio.$gte = min;
  }
  if (params.precioMax !== undefined) {
    const max = parseFloat(params.precioMax);
    if (!isNaN(max) && max >= 0) filtroPrecio.$lte = max;
  }
  if (Object.keys(filtroPrecio).length) query.precio = filtroPrecio;

  // ── Ciudad ────────────────────────────────────────────────────
  if (params.ciudad) {
    query["vendedor.ciudad"] = {
      $regex: new RegExp(sanitizeQuery(params.ciudad), "i"),
    };
  }

  // ── Talla (array de tallas disponibles) ───────────────────────
  if (params.talla) {
    const tallas = Array.isArray(params.talla)
      ? params.talla.map(sanitizeQuery)
      : [sanitizeQuery(params.talla)];
    query.tallas = { $in: tallas };
  }

  // ── Rating mínimo ─────────────────────────────────────────────
  if (params.rating !== undefined) {
    const ratingMin = parseFloat(params.rating);
    if (!isNaN(ratingMin) && ratingMin >= 0 && ratingMin <= 5) {
      query["rating.promedio"] = { $gte: ratingMin };
    }
  }

  return query;
}

// ─────────────────────────────────────────────
//  HELPER: construir opciones de ordenamiento
// ─────────────────────────────────────────────
function buildSort(ordenar, tieneTextSearch) {
  const mapa = {
    popular: { "rating.totalVentas": -1 },
    precioAsc: { precio: 1 },
    precioDesc: { precio: -1 },
    nuevo: { creadoEn: -1 },
  };

  if (ordenar && ORDENAR_OPCIONES.includes(ordenar)) {
    return mapa[ordenar];
  }

  // Si hay búsqueda de texto, ordenar por relevancia por defecto
  if (tieneTextSearch) {
    return { score: { $meta: "textScore" } };
  }

  return { creadoEn: -1 }; // Default: más recientes
}

// ─────────────────────────────────────────────
//  HELPER: construir proyección
// ─────────────────────────────────────────────
function buildProjection(tieneTextSearch) {
  const base = {
    nombre: 1,
    descripcion: 1,
    precio: 1,
    categoria: 1,
    tallas: 1,
    colores: 1,
    imagenes: 1,
    rating: 1,
    "vendedor.nombre": 1,
    "vendedor.ciudad": 1,
    "vendedor.logo": 1,
    creadoEn: 1,
  };

  if (tieneTextSearch) {
    base.score = { $meta: "textScore" };
  }

  return base;
}

// ─────────────────────────────────────────────
//  CONTROLADOR PRINCIPAL
// ─────────────────────────────────────────────
const searchProductos = async (req, res) => {
  try {
    // ── Parsear y validar parámetros de paginación ────────────
    let pagina = parseInt(req.query.pagina) || 1;
    let limite = parseInt(req.query.limite) || LIMITE_DEFAULT;

    if (pagina < 1) pagina = 1;
    if (limite < 1) limite = 1;
    if (limite > LIMITE_MAX) limite = LIMITE_MAX;

    const skip = (pagina - 1) * limite;

    // ── Construir query ───────────────────────────────────────
    const query = buildQuery(req.query);
    const tieneTextSearch = !!query.$text;
    const sort = buildSort(req.query.ordenar, tieneTextSearch);
    const projection = buildProjection(tieneTextSearch);

    // ── Ejecutar búsqueda y conteo en paralelo ────────────────
    const [resultados, total] = await Promise.all([
      Producto.find(query, projection)
        .sort(sort)
        .skip(skip)
        .limit(limite)
        .lean(),
      Producto.countDocuments(query),
    ]);

    // ── Calcular paginación ───────────────────────────────────
    const paginas = Math.ceil(total / limite);

    // ── Respuesta estandarizada ───────────────────────────────
    return res.status(200).json({
      ok: true,
      resultados,
      total,
      pagina,
      paginas,
      perPagina: limite,
      filtrosAplicados: buildFiltrosAplicados(req.query),
    });
  } catch (error) {
    console.error("[SearchController] Error:", error.message);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al realizar la búsqueda",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────
//  HELPER: resumen de filtros activos
// ─────────────────────────────────────────────
function buildFiltrosAplicados(query) {
  const filtros = {};
  if (query.q) filtros.busqueda = sanitizeQuery(query.q);
  if (query.categoria) filtros.categoria = query.categoria;
  if (query.precioMin) filtros.precioMin = parseFloat(query.precioMin);
  if (query.precioMax) filtros.precioMax = parseFloat(query.precioMax);
  if (query.ciudad) filtros.ciudad = query.ciudad;
  if (query.talla) filtros.talla = query.talla;
  if (query.rating) filtros.ratingMin = parseFloat(query.rating);
  if (query.ordenar) filtros.ordenar = query.ordenar;
  return filtros;
}

// ─────────────────────────────────────────────
//  CONTROLADOR: sugerencias de autocomplete
// ─────────────────────────────────────────────
const sugerencias = async (req, res) => {
  try {
    const q = sanitizeQuery(req.query.q || "");
    if (!q || q.length < 2) {
      return res.status(200).json({ ok: true, sugerencias: [] });
    }

    const regex = new RegExp(q, "i");

    const resultados = await Producto.find(
      { activo: true, nombre: regex },
      { nombre: 1, categoria: 1 }
    )
      .limit(8)
      .lean();

    const sugerencias = resultados.map((p) => ({
      id: p._id,
      nombre: p.nombre,
      categoria: p.categoria,
    }));

    return res.status(200).json({ ok: true, sugerencias });
  } catch (error) {
    console.error("[SearchController] Error sugerencias:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error en sugerencias" });
  }
};

// ─────────────────────────────────────────────
//  CONTROLADOR: filtros disponibles
// ─────────────────────────────────────────────
const filtrosDisponibles = async (req, res) => {
  try {
    const [categorias, ciudades, precioStats] = await Promise.all([
      Producto.distinct("categoria", { activo: true }),
      Producto.distinct("vendedor.ciudad", { activo: true }),
      Producto.aggregate([
        { $match: { activo: true } },
        {
          $group: {
            _id: null,
            minPrecio: { $min: "$precio" },
            maxPrecio: { $max: "$precio" },
          },
        },
      ]),
    ]);

    const precios = precioStats[0] || { minPrecio: 0, maxPrecio: 1000000 };

    return res.status(200).json({
      ok: true,
      filtros: {
        categorias: categorias.sort(),
        ciudades: ciudades.sort(),
        precioMin: precios.minPrecio,
        precioMax: precios.maxPrecio,
        tallas: ["XS", "S", "M", "L", "XL", "XXL", "Única"],
        ordenarOpciones: ORDENAR_OPCIONES,
      },
    });
  } catch (error) {
    console.error("[SearchController] Error filtros:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al obtener filtros" });
  }
};

// ─────────────────────────────────────────────
//  CONTROLADOR: búsqueda de negocios/talleres
// ─────────────────────────────────────────────
const Negocio = require("../models/Negocio");

const searchNegocios = async (req, res) => {
  try {
    let pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    let limite = Math.min(LIMITE_MAX, Math.max(1, parseInt(req.query.limite) || LIMITE_DEFAULT));
    const skip = (pagina - 1) * limite;

    const filtro = { activo: true };

    // Búsqueda de texto
    if (req.query.q) {
      const q = sanitizeQuery(req.query.q);
      if (q) filtro.$text = { $search: q };
    }

    // Filtro por categoría
    if (req.query.categoria) {
      filtro.categoria = { $regex: new RegExp(`^${sanitizeQuery(req.query.categoria)}$`, "i") };
    }

    // Filtro por ciudad
    if (req.query.ciudad) {
      filtro["ubicacion.ciudad"] = { $regex: new RegExp(sanitizeQuery(req.query.ciudad), "i") };
    }

    // Filtro por valoración mínima
    if (req.query.valoracion) {
      const val = parseFloat(req.query.valoracion);
      if (!isNaN(val)) filtro.valoracionPromedio = { $gte: val };
    }

    // Ordenamiento
    const ordenMap = {
      valoracion: { valoracionPromedio: -1 },
      reseñas:    { totalReseñas: -1 },
      nuevo:      { createdAt: -1 },
      nombre:     { nombre: 1 },
    };
    const sort = ordenMap[req.query.ordenar] || (filtro.$text ? { score: { $meta: "textScore" } } : { createdAt: -1 });

    const proyeccion = {
      nombre: 1, descripcion: 1, categoria: 1,
      "ubicacion.ciudad": 1, "ubicacion.departamento": 1,
      "contacto.whatsapp": 1, "contacto.instagram": 1,
      imagenes: 1, valoracionPromedio: 1, totalReseñas: 1,
      ...(filtro.$text ? { score: { $meta: "textScore" } } : {}),
    };

    const [negocios, total] = await Promise.all([
      Negocio.find(filtro, proyeccion).sort(sort).skip(skip).limit(limite).lean(),
      Negocio.countDocuments(filtro),
    ]);

    return res.status(200).json({
      ok: true,
      negocios,
      total,
      pagina,
      paginas:   Math.ceil(total / limite),
      perPagina: limite,
    });
  } catch (error) {
    console.error("[SearchController] Error negocios:", error.message);
    return res.status(500).json({ ok: false, mensaje: "Error al buscar negocios" });
  }
};

module.exports = { searchProductos, searchNegocios, sugerencias, filtrosDisponibles };

/**
 * ConnectModa – Controller de Productos
 * CRUD completo con invalidación de caché en cada mutación
 *
 * Las rutas GET usan el middleware de caché directamente.
 * Las mutaciones (POST/PUT/PATCH/DELETE) llaman a invalidarProducto()
 * al final de cada operación exitosa.
 */

const mongoose = require("mongoose");
const Producto = require("../models/Producto");
const {
  invalidarProducto,
  invalidarCategorias,
  invalidarBusquedas,
  withCache,
} = require("../middleware/cache");
const redis = require("../utils/redis");
const sm    = require("../utils/socketManager");

// ─────────────────────────────────────────────
//  1. LISTAR PRODUCTOS — GET /api/productos
//  El middleware cacheProductos actúa antes de llegar aquí.
//  Si hay HIT, este controller nunca se ejecuta.
// ─────────────────────────────────────────────
const listarProductos = async (req, res) => {
  try {
    let pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    let limite = Math.min(50, Math.max(1, parseInt(req.query.limite) || 20));
    const skip = (pagina - 1) * limite;

    const filtro = { activo: true };
    if (req.query.categoria) filtro.categoria = req.query.categoria;
    if (req.query.vendedor)  filtro["vendedor.id"] = req.query.vendedor;

    const [productos, total] = await Promise.all([
      Producto.find(filtro)
        .select("nombre precio categoria imagenes rating vendedor tallas")
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limite)
        .lean(),
      Producto.countDocuments(filtro),
    ]);

    return res.status(200).json({
      ok:        true,
      productos,
      total,
      pagina,
      paginas:   Math.ceil(total / limite),
      perPagina: limite,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al listar productos" });
  }
};

// ─────────────────────────────────────────────
//  2. OBTENER PRODUCTO — GET /api/productos/:id
//  El middleware cacheProducto actúa antes de llegar aquí.
// ─────────────────────────────────────────────
const obtenerProductoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, mensaje: "ID inválido" });
    }

    const producto = await Producto.findById(id).lean();
    if (!producto || !producto.activo) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    return res.status(200).json({ ok: true, producto });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al obtener producto" });
  }
};

// ─────────────────────────────────────────────
//  3. CREAR PRODUCTO — POST /api/productos
//  → Invalidar listas + búsquedas + categorías
// ─────────────────────────────────────────────
const crearProducto = async (req, res) => {
  try {
    const usuarioId = req.usuario._id;
    const {
      nombre, descripcion, precio, categoria,
      tallas, colores, imagenes, stock, tags,
    } = req.body;

    // Validaciones básicas
    if (!nombre || !precio || !categoria) {
      return res.status(400).json({
        ok:      false,
        mensaje: "nombre, precio y categoría son obligatorios",
      });
    }

    const producto = await Producto.create({
      nombre,
      descripcion,
      precio,
      categoria,
      tallas:   tallas   || [],
      colores:  colores  || [],
      imagenes: imagenes || [],
      stock:    stock    || 0,
      tags:     tags     || [],
      vendedor: {
        id:     usuarioId,
        nombre: req.usuario.nombre,
        ciudad: req.usuario.ciudad || "Sin especificar",
      },
    });

    // ── Invalidar caché ──────────────────────────────────────
    await Promise.allSettled([
      invalidarProducto(producto._id),   // Listas + búsquedas
      invalidarCategorias(),             // La nueva categoría puede aparecer
    ]);

    // ── Notificar a admins vía Socket.io ──────────────────────
    sm.notificarProductoPendiente(producto);

    return res.status(201).json({ ok: true, mensaje: "Producto creado", producto });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al crear producto" });
  }
};

// ─────────────────────────────────────────────
//  4. ACTUALIZAR PRODUCTO — PUT /api/productos/:id
//  → Invalidar este producto + listas + búsquedas
// ─────────────────────────────────────────────
const actualizarProducto = async (req, res) => {
  try {
    const { id }    = req.params;
    const usuarioId = req.usuario._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, mensaje: "ID inválido" });
    }

    const producto = await Producto.findById(id);
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    // Verificar propiedad (o ser admin)
    const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
    if (!esAdmin && producto.vendedor.id.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permisos para editar este producto" });
    }

    const camposPermitidos = [
      "nombre", "descripcion", "precio", "categoria",
      "tallas", "colores", "imagenes", "stock", "tags", "activo",
    ];

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) producto[campo] = req.body[campo];
    });

    const productoActualizado = await producto.save();

    // ── Invalidar caché ──────────────────────────────────────
    // Invalidar producto + listas + búsquedas relacionadas
    await invalidarProducto(id);

    // Si cambió la categoría, invalidar también categorías
    if (req.body.categoria && req.body.categoria !== producto.categoria) {
      await invalidarCategorias();
    }

    return res.status(200).json({ ok: true, producto: productoActualizado });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al actualizar producto" });
  }
};

// ─────────────────────────────────────────────
//  5. ELIMINAR PRODUCTO — DELETE /api/productos/:id
//  → Invalidar todo lo relacionado
// ─────────────────────────────────────────────
const eliminarProducto = async (req, res) => {
  try {
    const { id }    = req.params;
    const usuarioId = req.usuario._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, mensaje: "ID inválido" });
    }

    const producto = await Producto.findById(id);
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
    if (!esAdmin && producto.vendedor.id.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permisos" });
    }

    // Soft delete — mantener en BD para auditoría de órdenes pasadas
    producto.activo = false;
    await producto.save();

    // ── Invalidar TODO lo relacionado ─────────────────────────
    await Promise.allSettled([
      invalidarProducto(id),
      invalidarCategorias(),
      invalidarBusquedas(),
    ]);

    return res.status(200).json({ ok: true, mensaje: "Producto eliminado correctamente" });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al eliminar producto" });
  }
};

// ─────────────────────────────────────────────
//  6. LISTAR CATEGORÍAS — GET /api/categorias
//  El middleware cacheCategorias actúa antes de llegar aquí.
// ─────────────────────────────────────────────
const listarCategorias = async (req, res) => {
  try {
    const categorias = await Producto.distinct("categoria", { activo: true });

    return res.status(200).json({
      ok: true,
      categorias: categorias.sort(),
      total: categorias.length,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al obtener categorías" });
  }
};

// ─────────────────────────────────────────────
//  7. ESTADO DEL CACHÉ — GET /api/cache/stats (Admin)
// ─────────────────────────────────────────────
const estadoCache = async (req, res) => {
  try {
    if (!["admin"].includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, mensaje: "Solo administradores" });
    }

    const statsRedis = await redis.stats();
    const estado     = redis.getEstado();

    return res.status(200).json({
      ok:          true,
      conectado:   estado.conectado,
      stats:       statsRedis,
      ttls:        redis.TTL,
      prefijos:    redis.PREFIX,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al obtener estadísticas" });
  }
};

// ─────────────────────────────────────────────
//  8. VACIAR CACHÉ MANUAL — DELETE /api/cache (Admin)
// ─────────────────────────────────────────────
const vaciarCache = async (req, res) => {
  try {
    if (!["admin"].includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, mensaje: "Solo administradores" });
    }

    const { tipo } = req.query; // "productos", "busquedas", "categorias", "todo"
    let eliminadas = 0;

    switch (tipo) {
      case "productos":
        eliminadas = await invalidarProducto("*"); break;
      case "busquedas":
        eliminadas = await invalidarBusquedas(); break;
      case "categorias":
        eliminadas = await invalidarCategorias(); break;
      case "todo":
      default:
        eliminadas = await redis.flushAll();
    }

    return res.status(200).json({ ok: true, mensaje: `Caché limpiado`, tipo, eliminadas });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: "Error al limpiar caché" });
  }
};

module.exports = {
  listarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarCategorias,
  estadoCache,
  vaciarCache,
};

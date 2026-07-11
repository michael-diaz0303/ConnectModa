/**
 * ConnectModa – Controller de IA
 * Recomendaciones personalizadas, consultor de moda y análisis de preferencias
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const { RecomendacionIA, ChatHistorial } = require("../models/RecomendacionIA");
const Producto  = require("../models/Producto");
const redis     = require("../utils/redis");
const iaService = require("../utils/iaService");
const {
  promptRecomendaciones,
  promptEntenderPreferencias,
  promptConsultor,
  recomendacionesFallback,
} = require("../utils/iaPrompts");

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const TTL_RECOMENDACIONES = 24 * 3600;   // 24 horas en caché
const MAX_PRODUCTOS_CATALOGO = 80;        // Límite para no inflar el prompt
const MAX_MENSAJES_SESION    = 20;        // Máximo historial a enviar a la IA

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "IAController", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  HELPER: obtener o crear perfil del usuario
// ─────────────────────────────────────────────
async function obtenerOCrearPerfil(usuarioId) {
  let perfil = await RecomendacionIA.findOne({ usuario: usuarioId });
  if (!perfil) {
    perfil = await RecomendacionIA.create({ usuario: usuarioId });
  }
  return perfil;
}

// ─────────────────────────────────────────────
//  HELPER: obtener catálogo relevante
//  Limita el catálogo para no sobrecargar el contexto de la IA
// ─────────────────────────────────────────────
async function obtenerCatalogoRelevante(perfil) {
  const query = { activo: true };

  // Si el usuario tiene categorías preferidas, priorizar esas
  if (perfil.categorias_preferidas?.length > 0) {
    // Mitad del catálogo: categorías preferidas
    const [preferidos, populares] = await Promise.all([
      Producto.find({ ...query, categoria: { $in: perfil.categorias_preferidas } })
        .sort({ "rating.totalVentas": -1 })
        .limit(Math.floor(MAX_PRODUCTOS_CATALOGO * 0.6))
        .select("nombre precio categoria tallas colores imagenes rating vendedor")
        .lean(),
      Producto.find(query)
        .sort({ "rating.totalVentas": -1 })
        .limit(Math.ceil(MAX_PRODUCTOS_CATALOGO * 0.4))
        .select("nombre precio categoria tallas colores imagenes rating vendedor")
        .lean(),
    ]);
    // Deduplicar
    const ids = new Set(preferidos.map((p) => p._id.toString()));
    return [...preferidos, ...populares.filter((p) => !ids.has(p._id.toString()))];
  }

  // Sin preferencias: productos más populares
  return Producto.find(query)
    .sort({ "rating.totalVentas": -1, "rating.promedio": -1 })
    .limit(MAX_PRODUCTOS_CATALOGO)
    .select("nombre precio categoria tallas colores imagenes rating vendedor")
    .lean();
}

// ─────────────────────────────────────────────
//  1. GET /api/ia/recomendaciones
// ─────────────────────────────────────────────
const obtenerRecomendaciones = async (req, res) => {
  const usuarioId = req.usuario._id.toString();

  try {
    // ── Revisar caché Redis primero ───────────────────────────
    const cacheKey  = `ia:recomendaciones:${usuarioId}`;
    const enCache   = await redis.get(cacheKey);

    if (enCache && !req.query.forzar) {
      log("info", "recomendaciones_cache_hit", { usuarioId });
      return res.status(200).json({ ...enCache, _fromCache: true });
    }

    // ── Obtener perfil y catálogo ─────────────────────────────
    const [perfil, catalogo] = await Promise.all([
      obtenerOCrearPerfil(usuarioId),
      obtenerCatalogoRelevante(await obtenerOCrearPerfil(usuarioId)),
    ]);

    if (catalogo.length === 0) {
      return res.status(200).json({ ok: true, recomendaciones: [], mensaje: "Sin productos disponibles" });
    }

    // ── Llamar a la IA ────────────────────────────────────────
    let datosIA;
    let usandoFallback = false;

    try {
      const mensajes = promptRecomendaciones(perfil, catalogo);
      const resultado = await iaService.llamarIA(mensajes, {
        maxTokens: 1200,
        usuarioId,
        esperarJSON: true,
      });
      datosIA = resultado.datos;

      log("info", "recomendaciones_ia_ok", {
        usuarioId,
        totalRecomendadas: datosIA.recomendaciones?.length,
        tokens: resultado.tokens,
        proveedor: iaService.PROVEEDOR,
      });

    } catch (errIA) {
      log("warn", "recomendaciones_ia_fallback", { usuarioId, error: errIA.message });
      datosIA        = recomendacionesFallback(perfil, catalogo);
      usandoFallback = true;
    }

    // ── Validar que los IDs existan en el catálogo ────────────
    const catalogoIds = new Set(catalogo.map((p) => p._id.toString()));
    const recomendacionesValidas = (datosIA.recomendaciones || [])
      .filter((r) => catalogoIds.has(r.id))
      .slice(0, 10);

    // ── Enriquecer con datos reales del producto ──────────────
    const productosMap = new Map(catalogo.map((p) => [p._id.toString(), p]));
    const recomendacionesEnriquecidas = recomendacionesValidas.map((r) => ({
      ...r,
      producto: productosMap.get(r.id),
    }));

    // ── Actualizar perfil con la recomendación ────────────────
    await RecomendacionIA.findOneAndUpdate(
      { usuario: usuarioId },
      {
        ultima_recomendacion_ids: recomendacionesValidas.map((r) => r.id),
        resumen_ia:               datosIA.resumen_preferencias,
        ultima_actualizacion:     new Date(),
      }
    );

    const respuesta = {
      ok: true,
      recomendaciones:      recomendacionesEnriquecidas,
      total:                recomendacionesEnriquecidas.length,
      resumen_preferencias: datosIA.resumen_preferencias,
      consejos:             datosIA.consejos,
      proveedor_ia:         usandoFallback ? "fallback" : iaService.PROVEEDOR,
      _fallback:            usandoFallback,
    };

    // ── Guardar en caché 24h ──────────────────────────────────
    await redis.set(cacheKey, respuesta, TTL_RECOMENDACIONES);

    return res.status(200).json(respuesta);

  } catch (error) {
    log("error", "obtenerRecomendaciones", { usuarioId, error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener recomendaciones" });
  }
};

// ─────────────────────────────────────────────
//  2. POST /api/ia/entender-preferencias
// ─────────────────────────────────────────────
const entenderPreferencias = async (req, res) => {
  const usuarioId = req.usuario._id.toString();

  try {
    const { descripcion } = req.body;

    if (!descripcion || typeof descripcion !== "string" || descripcion.trim().length < 10) {
      return res.status(400).json({
        ok:      false,
        mensaje: "Describe tus preferencias (mínimo 10 caracteres)",
      });
    }

    const descripcionLimpia = descripcion.trim().substring(0, 500);
    const perfil = await obtenerOCrearPerfil(usuarioId);

    // ── Llamar a la IA para analizar preferencias ─────────────
    let analisis;

    try {
      const mensajes  = promptEntenderPreferencias(descripcionLimpia, perfil.productos_comprados);
      const resultado = await iaService.llamarIA(mensajes, {
        maxTokens: 600,
        usuarioId,
        esperarJSON: true,
      });
      analisis = resultado.datos;

      log("info", "preferencias_analizadas_ia", {
        usuarioId,
        categorias:  analisis.categorias_preferidas,
        tokens:      resultado.tokens,
        proveedor:   iaService.PROVEEDOR,
      });

    } catch (errIA) {
      log("warn", "preferencias_fallback", { usuarioId, error: errIA.message });
      // Fallback: extracción básica por palabras clave
      analisis = extraerPreferenciasFallback(descripcionLimpia);
    }

    // ── Actualizar perfil del usuario ─────────────────────────
    const actualizacion = {
      descripcion_preferencias: descripcionLimpia,
      ultima_actualizacion:     new Date(),
    };

    if (analisis.categorias_preferidas?.length) {
      actualizacion.categorias_preferidas = analisis.categorias_preferidas;
    }
    if (analisis.precio_rango?.promedio) {
      actualizacion.precio_promedio    = analisis.precio_rango.promedio;
      actualizacion.precio_min_habitual = analisis.precio_rango.min;
      actualizacion.precio_max_habitual = analisis.precio_rango.max;
    }

    await RecomendacionIA.findOneAndUpdate({ usuario: usuarioId }, actualizacion);

    // Invalidar caché de recomendaciones para que se regeneren
    await redis.del(`ia:recomendaciones:${usuarioId}`);

    return res.status(200).json({
      ok:      true,
      mensaje: "Preferencias actualizadas correctamente",
      analisis,
      _proveedor: iaService.PROVEEDOR,
    });

  } catch (error) {
    log("error", "entenderPreferencias", { usuarioId, error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al analizar preferencias" });
  }
};

// ─────────────────────────────────────────────
//  3. POST /api/ia/consultor
// ─────────────────────────────────────────────
const chatConsultor = async (req, res) => {
  const usuarioId = req.usuario._id.toString();

  try {
    const { mensaje, sesionId } = req.body;

    if (!mensaje || typeof mensaje !== "string" || mensaje.trim().length === 0) {
      return res.status(400).json({ ok: false, mensaje: "El mensaje no puede estar vacío" });
    }

    const mensajeLimpio = mensaje.trim().substring(0, 1000);
    const sesionActual  = sesionId || crypto.randomUUID();

    // ── Obtener o crear sesión de chat ────────────────────────
    let sesion = await ChatHistorial.findOne({ usuario: usuarioId, sesion_id: sesionActual });
    if (!sesion) {
      sesion = await ChatHistorial.create({
        usuario:      usuarioId,
        sesion_id:    sesionActual,
        mensajes:     [],
        proveedor_ia: iaService.PROVEEDOR,
      });
    }

    // Añadir mensaje del usuario
    sesion.mensajes.push({ rol: "user", contenido: mensajeLimpio });

    // ── Catálogo de contexto (productos relevantes) ───────────
    const catalogo = await Producto.find({ activo: true })
      .sort({ "rating.totalVentas": -1 })
      .limit(30)
      .select("nombre precio categoria tallas")
      .lean();

    // ── Historial reciente para contexto ─────────────────────
    const historialParaIA = sesion.mensajes
      .slice(-MAX_MENSAJES_SESION)
      .map((m) => ({ rol: m.rol, contenido: m.contenido }));

    // ── Llamar a la IA ────────────────────────────────────────
    let respuestaIA;
    let productosRecomendados = [];

    try {
      const mensajes  = promptConsultor(historialParaIA, catalogo);
      const resultado = await iaService.llamarIA(mensajes, {
        maxTokens: 800,
        usuarioId,
        esperarJSON: true,
      });

      respuestaIA          = resultado.datos.mensaje || "Aquí tienes algunas sugerencias.";
      productosRecomendados = resultado.datos.productos_recomendados || [];

      // Guardar respuesta en historial
      sesion.mensajes.push({
        rol:       "assistant",
        contenido: respuestaIA,
        tokens_usados:         resultado.tokens,
        productos_mencionados: productosRecomendados,
      });
      sesion.tokens_totales += resultado.tokens || 0;

      log("info", "consultor_respuesta", {
        usuarioId,
        sesionId:   sesionActual,
        tokens:     resultado.tokens,
        productos:  productosRecomendados.length,
      });

    } catch (errIA) {
      log("warn", "consultor_fallback", { usuarioId, error: errIA.message });
      respuestaIA = "Disculpa, en este momento no puedo procesar tu consulta. Te recomiendo usar la búsqueda avanzada para encontrar lo que necesitas.";
      sesion.mensajes.push({ rol: "assistant", contenido: respuestaIA });
    }

    await sesion.save();

    // ── Enriquecer productos recomendados ─────────────────────
    let productosDetalle = [];
    if (productosRecomendados.length > 0) {
      const ids    = productosRecomendados.filter((id) => mongoose.Types.ObjectId.isValid(id));
      productosDetalle = await Producto.find({ _id: { $in: ids }, activo: true })
        .select("nombre precio categoria imagenes rating vendedor")
        .lean();
    }

    return res.status(200).json({
      ok:          true,
      respuesta:   respuestaIA,
      sesionId:    sesionActual,
      productos:   productosDetalle,
      _proveedor:  iaService.PROVEEDOR,
    });

  } catch (error) {
    log("error", "chatConsultor", { usuarioId, error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error en el consultor de IA" });
  }
};

// ─────────────────────────────────────────────
//  4. GET /api/ia/consultor/historial
// ─────────────────────────────────────────────
const obtenerHistorialChat = async (req, res) => {
  const usuarioId = req.usuario._id.toString();

  try {
    let pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    let limite = Math.min(20, Math.max(1, parseInt(req.query.limite) || 10));
    const skip = (pagina - 1) * limite;

    const { sesionId } = req.query;

    // Si se pide una sesión específica
    if (sesionId) {
      const sesion = await ChatHistorial.findOne({ usuario: usuarioId, sesion_id: sesionId });
      if (!sesion) return res.status(404).json({ ok: false, mensaje: "Sesión no encontrada" });
      return res.status(200).json({ ok: true, sesion });
    }

    // Listar todas las sesiones del usuario
    const [sesiones, total] = await Promise.all([
      ChatHistorial.find({ usuario: usuarioId })
        .select("sesion_id creadoEn actualizadoEn tokens_totales activa mensajes")
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limite)
        .lean(),
      ChatHistorial.countDocuments({ usuario: usuarioId }),
    ]);

    // Resumir: solo mostrar el primer y último mensaje de cada sesión
    const sesionesResumidas = sesiones.map((s) => ({
      ...s,
      totalMensajes: s.mensajes.length,
      primerMensaje: s.mensajes[0]?.contenido?.substring(0, 80),
      ultimoMensaje: s.mensajes[s.mensajes.length - 1]?.contenido?.substring(0, 80),
      mensajes:      undefined, // No enviar todos los mensajes en el listado
    }));

    return res.status(200).json({
      ok:      true,
      sesiones: sesionesResumidas,
      total,
      pagina,
      paginas: Math.ceil(total / limite),
    });

  } catch (error) {
    log("error", "obtenerHistorialChat", { usuarioId, error: error.message });
    return res.status(500).json({ ok: false, mensaje: "Error al obtener historial" });
  }
};

// ─────────────────────────────────────────────
//  FALLBACK: extracción básica de preferencias
//  sin IA — solo regex y palabras clave
// ─────────────────────────────────────────────
function extraerPreferenciasFallback(descripcion) {
  const texto = descripcion.toLowerCase();

  const mapaCategorias = {
    "vestido":     "Vestidos",
    "camisa":      "Camisas",
    "pantalon":    "Pantalones",
    "falda":       "Faldas",
    "abrigo":      "Abrigos",
    "accesorio":   "Accesorios",
    "deportiva":   "Ropa Deportiva",
    "calzado":     "Calzado",
    "niño":        "Niños",
    "formal":      "Formal",
    "casual":      "Casual",
  };

  const categorias = Object.entries(mapaCategorias)
    .filter(([k]) => texto.includes(k))
    .map(([, v]) => v);

  // Detectar rangos de precio
  const precioMatch = texto.match(/(\d[\d.]*)\s*(mil|pesos|cop)?/g);
  const precios = (precioMatch || [])
    .map((m) => parseInt(m.replace(/\D/g, "")) * (m.includes("mil") ? 1000 : 1))
    .filter((n) => n >= 10000 && n <= 5000000);

  return {
    categorias_preferidas: categorias.length ? categorias : ["Casual"],
    precio_rango: {
      min:      precios.length ? Math.min(...precios) : 50000,
      max:      precios.length ? Math.max(...precios) : 300000,
      promedio: precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : 150000,
    },
    estilos:   [],
    resumen:   "Preferencias extraídas automáticamente",
    _fallback: true,
  };
}

// ─────────────────────────────────────────────
//  HELPER EXTERNO: invalidar caché de recomendaciones
//  Llamar desde ordenController cuando el usuario compra
// ─────────────────────────────────────────────
async function invalidarCacheRecomendaciones(usuarioId) {
  await redis.del(`ia:recomendaciones:${usuarioId.toString()}`);
}

module.exports = {
  obtenerRecomendaciones,
  entenderPreferencias,
  chatConsultor,
  obtenerHistorialChat,
  invalidarCacheRecomendaciones,
};

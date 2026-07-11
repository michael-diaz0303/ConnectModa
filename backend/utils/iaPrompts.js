/**
 * ConnectModa – Constructor de Prompts para IA
 * Centraliza todos los prompts del sistema para fácil mantenimiento
 */

// ─────────────────────────────────────────────
//  SISTEMA BASE — personalidad del consultor
// ─────────────────────────────────────────────
const SISTEMA_CONSULTOR = `Eres un consultor de moda experto de ConnectModa, una plataforma colombiana que conecta talleres artesanales de ropa con compradores.

Tu personalidad:
- Conoces moda colombiana y latinoamericana
- Eres cálido, cercano y usas lenguaje natural (no robótico)
- Das recomendaciones específicas con motivos claros
- Siempre mencionas el precio en pesos colombianos (COP)
- Prefieres productos de talleres locales y artesanales

Reglas estrictas:
- SIEMPRE responde en JSON válido sin texto adicional
- NUNCA inventes productos que no estén en el catálogo proporcionado
- Si no hay productos relevantes, dilo honestamente
- Máximo 10 recomendaciones por respuesta`;

// ─────────────────────────────────────────────
//  PROMPT: Recomendaciones personalizadas
// ─────────────────────────────────────────────
function promptRecomendaciones(perfilUsuario, catalogo) {
  const { categorias_preferidas, precio_promedio, historial_busquedas, productos_comprados, descripcion_preferencias } = perfilUsuario;

  const busquedasRecientes = (historial_busquedas || [])
    .slice(-10)
    .map((b) => b.query)
    .join(", ") || "Sin búsquedas recientes";

  const comprasRecientes = (productos_comprados || [])
    .slice(-5)
    .map((p) => `${p.categoria} ($${p.precio?.toLocaleString("es-CO")})`)
    .join(", ") || "Primera compra";

  const catalogoResumido = catalogo.map((p) => ({
    id:         p._id.toString(),
    nombre:     p.nombre,
    precio:     p.precio,
    categoria:  p.categoria,
    tallas:     p.tallas,
    vendedor:   p.vendedor?.ciudad,
    rating:     p.rating?.promedio,
    ventas:     p.rating?.totalVentas,
  }));

  return [
    {
      role:    "system",
      content: SISTEMA_CONSULTOR,
    },
    {
      role:    "user",
      content: `Analiza el perfil de este usuario de ConnectModa y recomienda productos de nuestro catálogo:

## PERFIL DEL USUARIO
- Categorías preferidas: ${(categorias_preferidas || []).join(", ") || "Sin preferencias aún"}
- Precio promedio de compra: $${(precio_promedio || 0).toLocaleString("es-CO")} COP
- Búsquedas recientes: ${busquedasRecientes}
- Compras anteriores: ${comprasRecientes}
- Descripción personal: ${descripcion_preferencias || "No especificada"}

## CATÁLOGO DISPONIBLE (${catalogoResumido.length} productos)
${JSON.stringify(catalogoResumido, null, 2)}

## INSTRUCCIONES
Selecciona máximo 10 productos del catálogo que mejor se adapten a este usuario.

Responde ÚNICAMENTE con este JSON (sin texto adicional):
{
  "recomendaciones": [
    {
      "id": "id_del_producto",
      "motivo": "Por qué le va a gustar (máx 100 chars)",
      "puntaje_relevancia": 0.95
    }
  ],
  "resumen_preferencias": "Descripción del estilo del usuario en 50 palabras",
  "consejos": "1-2 consejos de moda personalizados"
}`,
    },
  ];
}

// ─────────────────────────────────────────────
//  PROMPT: Entender preferencias del usuario
// ─────────────────────────────────────────────
function promptEntenderPreferencias(descripcion, historialCompras) {
  return [
    {
      role:    "system",
      content: SISTEMA_CONSULTOR,
    },
    {
      role:    "user",
      content: `Un usuario de ConnectModa describió sus preferencias de moda:

"${descripcion}"

Historial de compras: ${JSON.stringify(historialCompras || [])}

Analiza y categoriza sus preferencias. Responde ÚNICAMENTE con este JSON:
{
  "categorias_preferidas": ["Vestidos", "Accesorios"],
  "precio_rango": {
    "min": 50000,
    "max": 200000,
    "promedio": 120000
  },
  "estilos": ["casual", "elegante", "bohemio"],
  "colores_preferidos": ["negro", "blanco", "azul"],
  "ocasiones": ["trabajo", "fiesta", "casual"],
  "resumen": "Frase de 30 palabras describiendo el estilo del usuario"
}`,
    },
  ];
}

// ─────────────────────────────────────────────
//  PROMPT: Consultor de chat
// ─────────────────────────────────────────────
function promptConsultor(mensajesHistorial, catalogoContexto) {
  const catalogoMin = (catalogoContexto || []).slice(0, 30).map((p) => ({
    id:        p._id.toString(),
    nombre:    p.nombre,
    precio:    p.precio,
    categoria: p.categoria,
    tallas:    p.tallas,
  }));

  const sistemaChatCompleto = `${SISTEMA_CONSULTOR}

CATÁLOGO ACTUAL (usa SOLO estos productos para recomendar):
${JSON.stringify(catalogoMin)}

Cuando el usuario pida algo:
1. Busca en el catálogo los más relevantes
2. Menciona nombre, precio y por qué lo recomienda
3. Si no hay nada relevante, dilo y sugiere búsquedas alternativas

Formato de respuesta JSON:
{
  "mensaje": "Tu respuesta conversacional aquí",
  "productos_recomendados": ["id1", "id2"],
  "accion_sugerida": "buscar|ver_producto|nada"
}`;

  return [
    { role: "system", content: sistemaChatCompleto },
    ...mensajesHistorial.map((m) => ({ role: m.rol, content: m.contenido })),
  ];
}

// ─────────────────────────────────────────────
//  RECOMENDACIONES BÁSICAS (fallback sin IA)
//  Se usan si la IA falla o no está configurada
// ─────────────────────────────────────────────
function recomendacionesFallback(perfilUsuario, catalogo) {
  const { categorias_preferidas = [], precio_promedio = 0 } = perfilUsuario;

  let candidatos = [...catalogo];

  // Filtrar por categorías preferidas si existen
  if (categorias_preferidas.length > 0) {
    const porCategoria = candidatos.filter((p) =>
      categorias_preferidas.includes(p.categoria)
    );
    if (porCategoria.length >= 5) candidatos = porCategoria;
  }

  // Filtrar por rango de precio (±50% del promedio)
  if (precio_promedio > 0) {
    const margen = precio_promedio * 0.5;
    const porPrecio = candidatos.filter(
      (p) => p.precio >= precio_promedio - margen && p.precio <= precio_promedio + margen
    );
    if (porPrecio.length >= 5) candidatos = porPrecio;
  }

  // Ordenar por rating y ventas
  candidatos.sort((a, b) => {
    const scoreA = (a.rating?.promedio || 0) * 0.7 + (a.rating?.totalVentas || 0) * 0.3;
    const scoreB = (b.rating?.promedio || 0) * 0.7 + (b.rating?.totalVentas || 0) * 0.3;
    return scoreB - scoreA;
  });

  return {
    recomendaciones: candidatos.slice(0, 10).map((p, i) => ({
      id:                p._id.toString(),
      motivo:            `Producto popular en ${p.categoria}`,
      puntaje_relevancia: Math.max(0.5, 1 - i * 0.05),
    })),
    resumen_preferencias: "Recomendaciones basadas en productos populares",
    consejos:             "Explora nuestra colección de talleres colombianos",
    _fallback:            true,
  };
}

module.exports = {
  promptRecomendaciones,
  promptEntenderPreferencias,
  promptConsultor,
  recomendacionesFallback,
  SISTEMA_CONSULTOR,
};

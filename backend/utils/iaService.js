/**
 * ConnectModa – Servicio de IA
 * Abstracción unificada para OpenAI, Claude, Gemini y Ollama (local)
 *
 * Seleccionar proveedor con IA_PROVIDER en .env:
 *   openai  → GPT-4o mini ($0.15/1M tokens)
 *   claude  → Claude Haiku ($0.80/1M tokens)
 *   gemini  → Gemini 1.5 Flash (gratis hasta límite)
 *   ollama  → Llama 3 local (100% gratis)
 */

// ─────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────
const PROVEEDOR = (process.env.IA_PROVIDER || "gemini").toLowerCase();
// Cada proveedor tiene su propia variable de entorno
const API_KEYS = {
  openai:    process.env.OPENAI_API_KEY    || process.env.IA_API_KEY || "",
  anthropic: process.env.ANTHROPIC_API_KEY || process.env.IA_API_KEY || "",
  gemini:    process.env.GEMINI_API_KEY    || process.env.IA_API_KEY || "",
  ollama:    "",  // Ollama corre local, no necesita key
};

function getApiKey(proveedor) {
  return API_KEYS[proveedor] || "";
}
const MODELO    = process.env.IA_MODEL;
const TIMEOUT   = 30000; // 30 segundos máximo por llamada

// Modelos por defecto si no se especifica IA_MODEL
const MODELOS_DEFAULT = {
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001",
  gemini: "gemini-1.5-flash",
  ollama: "llama3",
};

const modelo = MODELO || MODELOS_DEFAULT[PROVEEDOR] || "gpt-4o-mini";

// ─────────────────────────────────────────────
//  RATE LIMITING por IP / usuario
// ─────────────────────────────────────────────
const llamadasPorUsuario = new Map();
const MAX_LLAMADAS_HORA  = 20;

function checkRateLimit(usuarioId) {
  const ahora = Date.now();
  const d     = llamadasPorUsuario.get(usuarioId) || { count: 0, inicio: ahora };
  if (ahora - d.inicio > 3600000) { d.count = 0; d.inicio = ahora; }
  d.count++;
  llamadasPorUsuario.set(usuarioId, d);
  return d.count <= MAX_LLAMADAS_HORA;
}

setInterval(() => {
  const ahora = Date.now();
  for (const [id, d] of llamadasPorUsuario.entries()) {
    if (ahora - d.inicio > 3600000 * 2) llamadasPorUsuario.delete(id);
  }
}, 30 * 60 * 1000);

// ─────────────────────────────────────────────
//  ADAPTADORES POR PROVEEDOR
// ─────────────────────────────────────────────

async function llamarOpenAI(mensajes, maxTokens = 1000) {
  const resp = await fetchConTimeout("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey(PROVEEDOR)}` },
    body: JSON.stringify({
      model:       modelo,
      messages:    mensajes,
      max_tokens:  maxTokens,
      temperature: 0.3,          // Baja temperatura = respuestas más consistentes
      response_format: { type: "json_object" }, // Forzar JSON
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `OpenAI error ${resp.status}`);

  return {
    texto:   data.choices[0].message.content,
    tokens:  data.usage?.total_tokens || 0,
    modelo:  data.model,
  };
}

async function llamarClaude(mensajes, maxTokens = 1000) {
  // Separar el mensaje de sistema de los demás
  const sistema   = mensajes.find((m) => m.role === "system")?.content || "";
  const historial = mensajes.filter((m) => m.role !== "system");

  const resp = await fetchConTimeout("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         getApiKey(PROVEEDOR),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      modelo,
      max_tokens: maxTokens,
      system:     sistema,
      messages:   historial.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Claude error ${resp.status}`);

  return {
    texto:  data.content[0].text,
    tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    modelo: data.model,
  };
}

async function llamarGemini(mensajes, maxTokens = 1000) {
  const url    = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${getApiKey(PROVEEDOR)}`;
  const system = mensajes.find((m) => m.role === "system")?.content || "";

  // Gemini usa "parts" en lugar de "content"
  const contents = mensajes
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const resp = await fetchConTimeout(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: {
        maxOutputTokens:  maxTokens,
        temperature:      0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Gemini error ${resp.status}`);
  if (data.promptFeedback?.blockReason) throw new Error(`Contenido bloqueado: ${data.promptFeedback.blockReason}`);

  const texto   = data.candidates[0].content.parts[0].text;
  const tokens  = (data.usageMetadata?.totalTokenCount) || 0;

  return { texto, tokens, modelo };
}

async function llamarOllama(mensajes, maxTokens = 1000) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const sistema   = mensajes.find((m) => m.role === "system")?.content || "";
  const historial = mensajes.filter((m) => m.role !== "system");

  const resp = await fetchConTimeout(`${host}/api/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:    modelo,
      messages: [
        ...(sistema ? [{ role: "system", content: sistema }] : []),
        ...historial,
      ],
      stream:  false,
      options: { temperature: 0.3, num_predict: maxTokens },
      format:  "json",
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Ollama error ${resp.status}`);

  return {
    texto:  data.message.content,
    tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    modelo: data.model,
  };
}

// ─────────────────────────────────────────────
//  FETCH CON TIMEOUT
// ─────────────────────────────────────────────
async function fetchConTimeout(url, opciones) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const resp = await fetch(url, { ...opciones, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
//  PARSEAR RESPUESTA JSON DE IA
//  La IA puede envolver el JSON en ```json ... ``` o texto extra
// ─────────────────────────────────────────────
function parsearJSON(texto) {
  // Intentar parsear directamente
  try {
    return JSON.parse(texto);
  } catch (_) {}

  // Intentar extraer bloque JSON de markdown
  const match = texto.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch (_) {}
  }

  // Intentar extraer el primer objeto JSON del texto
  const objMatch = texto.match(/\{[\s\S]+\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }

  throw new Error("No se pudo parsear la respuesta JSON de la IA");
}

// ─────────────────────────────────────────────
//  FUNCIÓN PRINCIPAL: llamar a la IA
// ─────────────────────────────────────────────
async function llamarIA(mensajes, opciones = {}) {
  const { maxTokens = 1000, usuarioId = "anon", esperarJSON = true } = opciones;

  // Rate limiting
  if (!checkRateLimit(usuarioId)) {
    throw new Error("RATE_LIMIT: Has alcanzado el límite de consultas de IA por hora");
  }

  const inicio = Date.now();
  let resultado;

  try {
    switch (PROVEEDOR) {
      case "openai":
        resultado = await llamarOpenAI(mensajes, maxTokens);
        break;
      case "claude":
        resultado = await llamarClaude(mensajes, maxTokens);
        break;
      case "gemini":
        resultado = await llamarGemini(mensajes, maxTokens);
        break;
      case "ollama":
        resultado = await llamarOllama(mensajes, maxTokens);
        break;
      default:
        throw new Error(`Proveedor IA desconocido: "${PROVEEDOR}". Usa: openai, claude, gemini, ollama`);
    }

    const duracion = Date.now() - inicio;

    log("info", "llamada_ia", {
      proveedor: PROVEEDOR,
      modelo:    resultado.modelo,
      tokens:    resultado.tokens,
      duracionMs: duracion,
      usuarioId,
    });

    if (esperarJSON) {
      resultado.datos = parsearJSON(resultado.texto);
    }

    return resultado;

  } catch (err) {
    const duracion = Date.now() - inicio;
    log("error", "error_ia", {
      proveedor:  PROVEEDOR,
      error:      err.message,
      duracionMs: duracion,
      usuarioId,
    });
    throw err;
  }
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "IAService", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  llamarIA,
  parsearJSON,
  PROVEEDOR,
  modelo,
  MAX_LLAMADAS_HORA,
};

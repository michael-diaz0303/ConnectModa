/**
 * ConnectModa – Utilidades Wompi
 * Pasarela de pagos colombiana (Bancolombia)
 * Docs: https://docs.wompi.co
 *
 * Variables de entorno requeridas:
 *   WOMPI_PUBLIC_KEY     → pub_...
 *   WOMPI_PRIVATE_KEY    → prv_...
 *   WOMPI_EVENTS_SECRET  → Secreto para verificar eventos (webhooks)
 *   WOMPI_ENV            → "sandbox" | "production" (default: sandbox)
 */

const crypto = require("crypto");

// ─── Base URLs ────────────────────────────────────────────────────────────────

const WOMPI_ENV   = process.env.WOMPI_ENV || "sandbox";
const BASE_URL    = WOMPI_ENV === "production"
  ? "https://production.wompi.co/v1"
  : "https://sandbox.wompi.co/v1";

const PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const PUBLIC_KEY  = process.env.WOMPI_PUBLIC_KEY  || "";

// ─── Helper: fetch con auth ───────────────────────────────────────────────────

async function wompiRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${PRIVATE_KEY}`,
      "Content-Type":  "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res  = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.messages
      ? Object.values(data.error.messages).flat().join(", ")
      : data?.error?.type || "Error Wompi desconocido";
    throw new Error(msg);
  }
  return data;
}

// ─── Formateo de moneda ───────────────────────────────────────────────────────

/**
 * Wompi trabaja en centavos (entero).
 * Ej: $50.000 COP → 5000000 centavos
 */
function copACentavos(valorCOP) {
  return Math.round(valorCOP * 100);
}

function centavosACOP(centavos) {
  return centavos / 100;
}

function formatearCOP(valor) {
  return new Intl.NumberFormat("es-CO", {
    style:    "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(valor);
}

// ─── Crear transacción ────────────────────────────────────────────────────────

/**
 * Crea una transacción en Wompi.
 * Para PSE, Nequi y Bancolombia el flujo es:
 *   1. Crear token de pago (lo hace el frontend con el widget de Wompi)
 *   2. Enviar ese token aquí para crear la transacción
 *
 * @param {object} opciones
 * @param {number}  opciones.montoCOP       - Monto en pesos colombianos
 * @param {string}  opciones.referencia     - Referencia única de la orden
 * @param {string}  opciones.email          - Email del comprador
 * @param {string}  opciones.tokenPago      - Token generado por el widget Wompi
 * @param {string}  opciones.tipoPago       - "CARD" | "PSE" | "NEQUI" | "BANCOLOMBIA_TRANSFER"
 * @param {object}  [opciones.datosCliente] - { nombre, apellido, telefono, documento }
 * @param {object}  [opciones.datosPSE]     - { tipoPersona, tipoDoc, numDoc, urlRetorno }
 */
async function crearTransaccion({ montoCOP, referencia, email, tokenPago, tipoPago = "CARD", datosCliente = {}, datosPSE = {} }) {
  const body = {
    amount_in_cents:    copACentavos(montoCOP),
    currency:           "COP",
    customer_email:     email,
    reference:          referencia,
    payment_method: buildPaymentMethod(tipoPago, tokenPago, datosPSE),
  };

  if (datosCliente.nombre) {
    body.customer_data = {
      full_name:    `${datosCliente.nombre} ${datosCliente.apellido || ""}`.trim(),
      phone_number: datosCliente.telefono || undefined,
      legal_id:     datosCliente.documento || undefined,
      legal_id_type: datosCliente.tipoDoc || "CC",
    };
  }

  const data = await wompiRequest("POST", "/transactions", body);
  return data.data;
}

function buildPaymentMethod(tipo, token, datosPSE) {
  switch (tipo) {
    case "CARD":
      return { type: "CARD", token };

    case "NEQUI":
      return { type: "NEQUI", phone_number: token }; // token = número celular

    case "PSE":
      return {
        type:               "PSE",
        user_type:          datosPSE.tipoPersona || 0,  // 0=natural, 1=jurídico
        user_legal_id_type: datosPSE.tipoDoc     || "CC",
        user_legal_id:      datosPSE.numDoc,
        financial_institution_code: datosPSE.codigoBanco,
        payment_description: "ConnectModa – Pago de orden",
      };

    case "BANCOLOMBIA_TRANSFER":
      return {
        type:        "BANCOLOMBIA_TRANSFER",
        user_type:   datosPSE.tipoPersona || "PERSON",
        user_legal_id_type: datosPSE.tipoDoc || "CC",
        user_legal_id:      datosPSE.numDoc,
      };

    default:
      throw new Error(`Tipo de pago no soportado: ${tipo}`);
  }
}

// ─── Consultar transacción ────────────────────────────────────────────────────

async function consultarTransaccion(wompiId) {
  const data = await wompiRequest("GET", `/transactions/${wompiId}`);
  return data.data;
}

// ─── Consultar por referencia ─────────────────────────────────────────────────

async function consultarPorReferencia(referencia) {
  const data = await wompiRequest("GET", `/transactions?reference=${referencia}`);
  return data.data;
}

// ─── Obtener bancos PSE ───────────────────────────────────────────────────────

async function obtenerBancosPSE() {
  const data = await wompiRequest("GET", "/pse/financial_institutions");
  return data.data;
}

// ─── Verificar firma de evento (webhook) ──────────────────────────────────────

/**
 * Wompi envía los eventos con una firma en el header "X-Event-Checksum"
 * Fórmula: SHA256( properties + timestamp + secreto )
 */
function verificarFirmaEvento(payload, checksum) {
  const secreto = process.env.WOMPI_EVENTS_SECRET;
  if (!secreto) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const { data, sent_at } = payload;

  // Wompi usa: data.transaction.id + data.transaction.status + data.transaction.amount_in_cents + sent_at + secreto
  const cadena = [
    data?.transaction?.id          || "",
    data?.transaction?.status      || "",
    data?.transaction?.amount_in_cents || "",
    sent_at,
    secreto,
  ].join("");

  const firmaCalculada = crypto
    .createHash("sha256")
    .update(cadena)
    .digest("hex");

  return firmaCalculada === checksum;
}

// ─── Mapear estado Wompi a estado interno ─────────────────────────────────────

function mapearEstado(estadoWompi) {
  const mapa = {
    APPROVED:  "exitoso",
    DECLINED:  "fallido",
    VOIDED:    "reembolsado",
    ERROR:     "fallido",
    PENDING:   "procesando",
  };
  return mapa[estadoWompi] || "desconocido";
}

// ─── Exportar ─────────────────────────────────────────────────────────────────

module.exports = {
  crearTransaccion,
  consultarTransaccion,
  consultarPorReferencia,
  obtenerBancosPSE,
  verificarFirmaEvento,
  mapearEstado,
  copACentavos,
  centavosACOP,
  formatearCOP,
  PUBLIC_KEY,
  BASE_URL,
};

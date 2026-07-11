/**
 * ConnectModa – Lógica de Negocio de Órdenes
 * Cálculos de impuestos, envío, número de seguimiento
 */

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const IVA = 0.19; // 19% Colombia

// Tarifas de envío por ciudad (COP)
const TARIFAS_ENVIO = {
  bogotá:       8000,
  medellín:     8000,
  cali:         9000,
  barranquilla: 10000,
  bucaramanga:  11000,
  cartagena:    11000,
  cúcuta:       12000,
  pereira:      10000,
  manizales:    10000,
  ibagué:       11000,
  default:      15000, // Cualquier otra ciudad
};

const ENVIO_GRATIS_DESDE = 300000; // COP — envío gratis si subtotal >= $300.000

// ─────────────────────────────────────────────
//  calcularEnvio
// ─────────────────────────────────────────────
function calcularEnvio(ciudad = "", subtotal = 0) {
  if (subtotal >= ENVIO_GRATIS_DESDE) return 0;

  const ciudadNorm = ciudad
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Quitar tildes

  return TARIFAS_ENVIO[ciudadNorm] ?? TARIFAS_ENVIO.default;
}

// ─────────────────────────────────────────────
//  calcularTotales
// ─────────────────────────────────────────────
function calcularTotales(items, ciudad) {
  const subtotal = items.reduce((acc, item) => {
    const sub = parseFloat((item.precioUnitario * item.cantidad).toFixed(2));
    item.subtotal = sub;
    return acc + sub;
  }, 0);

  const impuestos = parseFloat((subtotal * IVA).toFixed(2));
  const envio     = calcularEnvio(ciudad, subtotal);
  const total     = parseFloat((subtotal + impuestos + envio).toFixed(2));

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    impuestos,
    envio,
    total,
  };
}

// ─────────────────────────────────────────────
//  generarNumeroSeguimiento
//  Formato: CM-YYYYMMDD-XXXXXX (CM = ConnectModa)
// ─────────────────────────────────────────────
function generarNumeroSeguimiento() {
  const hoy = new Date();
  const fecha = hoy.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).toUpperCase().slice(2, 8);
  return `CM-${fecha}-${random}`;
}

// ─────────────────────────────────────────────
//  calcularFechaEstimadaEntrega
//  Días hábiles desde hoy según ciudad
// ─────────────────────────────────────────────
function calcularFechaEstimadaEntrega(ciudad = "") {
  const ciudadNorm = ciudad
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const diasHabiles = ["bogotá", "medellín", "cali"].includes(ciudadNorm) ? 3 : 7;

  const fecha = new Date();
  let diasAgregados = 0;

  while (diasAgregados < diasHabiles) {
    fecha.setDate(fecha.getDate() + 1);
    const diaSemana = fecha.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasAgregados++; // Omitir sábado y domingo
  }

  return fecha;
}

// ─────────────────────────────────────────────
//  validarTransicionEstado
// ─────────────────────────────────────────────
function validarTransicionEstado(Orden, estadoActual, estadoNuevo) {
  if (!Orden.ESTADOS.includes(estadoNuevo)) {
    return { valido: false, mensaje: `Estado "${estadoNuevo}" no es válido` };
  }

  if (!Orden.transicionValida(estadoActual, estadoNuevo)) {
    const posibles = Orden.TRANSICIONES_VALIDAS[estadoActual] || [];
    const lista = posibles.length ? posibles.join(", ") : "ninguno";
    return {
      valido: false,
      mensaje: `No se puede pasar de "${estadoActual}" a "${estadoNuevo}". Transiciones permitidas: ${lista}`,
    };
  }

  return { valido: true };
}

module.exports = {
  calcularTotales,
  calcularEnvio,
  generarNumeroSeguimiento,
  calcularFechaEstimadaEntrega,
  validarTransicionEstado,
  IVA,
  TARIFAS_ENVIO,
  ENVIO_GRATIS_DESDE,
};

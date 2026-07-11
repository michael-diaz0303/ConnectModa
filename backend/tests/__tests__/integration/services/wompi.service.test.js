/**
 * ConnectModa – Tests de integración: servicio Wompi
 */

const {
  copACentavos,
  centavosACOP,
  formatearCOP,
  mapearEstado,
  verificarFirmaEvento,
} = require("../../../../utils/wompi");

describe("wompi utils", () => {
  // ── Conversión de montos ────────────────────────────────────────────────────

  describe("copACentavos", () => {
    it("convierte pesos a centavos correctamente", () => {
      expect(copACentavos(50000)).toBe(5000000);
      expect(copACentavos(1000)).toBe(100000);
      expect(copACentavos(150.5)).toBe(15050);
    });

    it("redondea valores con decimales", () => {
      expect(copACentavos(100.999)).toBe(10100);
    });
  });

  describe("centavosACOP", () => {
    it("convierte centavos a pesos correctamente", () => {
      expect(centavosACOP(5000000)).toBe(50000);
      expect(centavosACOP(100000)).toBe(1000);
    });
  });

  describe("formatearCOP", () => {
    it("formatea montos como pesos colombianos", () => {
      const formateado = formatearCOP(50000);
      expect(formateado).toContain("50.000");
      expect(formateado).toContain("$");
    });
  });

  // ── Mapeo de estados ────────────────────────────────────────────────────────

  describe("mapearEstado", () => {
    it("mapea estados de Wompi a estados internos", () => {
      expect(mapearEstado("APPROVED")).toBe("exitoso");
      expect(mapearEstado("DECLINED")).toBe("fallido");
      expect(mapearEstado("VOIDED")).toBe("reembolsado");
      expect(mapearEstado("ERROR")).toBe("fallido");
      expect(mapearEstado("PENDING")).toBe("procesando");
    });

    it("retorna desconocido para estados no mapeados", () => {
      expect(mapearEstado("ESTADO_RARO")).toBe("desconocido");
    });
  });

  // ── Verificación de firma ───────────────────────────────────────────────────

  describe("verificarFirmaEvento", () => {
    it("lanza error si WOMPI_EVENTS_SECRET no está configurado", () => {
      const secretoOriginal = process.env.WOMPI_EVENTS_SECRET;
      delete process.env.WOMPI_EVENTS_SECRET;

      expect(() =>
        verificarFirmaEvento({ data: { transaction: {} }, sent_at: "" }, "abc")
      ).toThrow("WOMPI_EVENTS_SECRET no configurado");

      process.env.WOMPI_EVENTS_SECRET = secretoOriginal;
    });

    it("retorna false con checksum inválido", () => {
      process.env.WOMPI_EVENTS_SECRET = "secreto_de_prueba";
      const payload = {
        data: { transaction: { id: "tx_1", status: "APPROVED", amount_in_cents: 5000000 } },
        sent_at: "2024-01-01T00:00:00.000Z",
      };
      const resultado = verificarFirmaEvento(payload, "checksum_invalido");
      expect(resultado).toBe(false);
      delete process.env.WOMPI_EVENTS_SECRET;
    });
  });
});

/**
 * Respuestas estandarizadas para toda la API de ConnectModa.
 * Uso: res.json(ApiResponse.success(data)) o ApiResponse.error(res, 404, 'mensaje')
 */

class ApiResponse {
  // ── ÉXITO ──────────────────────────────────────────────────────────────────
  static success(data = null, message = 'Operación exitosa', statusCode = 200) {
    return {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ── LISTA PAGINADA ─────────────────────────────────────────────────────────
  static paginated(data, pagination) {
    return {
      success: true,
      statusCode: 200,
      message: 'Consulta exitosa',
      data,
      pagination: {
        total:       pagination.total,
        page:        pagination.page,
        limit:       pagination.limit,
        totalPages:  Math.ceil(pagination.total / pagination.limit),
        hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrevPage: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  static error(res, statusCode = 500, message = 'Error interno del servidor', errors = null) {
    return res.status(statusCode).json({
      success:   false,
      statusCode,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  // ── CREADO ─────────────────────────────────────────────────────────────────
  static created(data, message = 'Recurso creado exitosamente') {
    return {
      success: true,
      statusCode: 201,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ApiResponse;
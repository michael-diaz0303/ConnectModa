// __tests__/unit/controllers/ordenController.test.js
// Tests unitarios del controlador de órdenes

const { mongoId, crearOrden, crearProducto } = require('../../fixtures');

// ─── Mocks de módulos ─────────────────────────────────────────────────────────

jest.mock('../../../src/models/Orden', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../../src/models/Producto', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../../src/models/Usuario', () => ({
  findById: jest.fn(),
}));


  // ── Test 1: Crear orden exitosamente ────────────────────────────────────────
  test('debe crear una orden exitosamente con datos válidos', async () => {
    const ordenCreada = {
      _id: mongoId(),
      ...crearOrden(empresaId, tallerId, productoId),
      total: 150000,
      referencia: 'CM-TEST01-ABC123',
    };

    Producto.findById.mockResolvedValue(productoMock);
    Orden.create.mockResolvedValue(ordenCreada);

    const { req, res } = crearReqResMock(ordenBodyValido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          orden: expect.any(Object),
        }),
      })
    );
  });

  // ── Test 2: Error sin usuario autenticado ───────────────────────────────────
  test('debe retornar 401 si no hay usuario autenticado', async () => {
    const { req, res } = crearReqResMock(ordenBodyValido);
    req.user = null;

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        mensaje: expect.stringContaining('autenticado'),
      })
    );
  });

  // ── Test 3: Error sin items en el carrito ───────────────────────────────────
  test('debe retornar 400 si el carrito está vacío', async () => {
    const { req, res } = crearReqResMock(
      { ...ordenBodyValido, items: [] },
      {},
      { id: empresaId, rol: 'empresa' }
    );

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        mensaje: expect.stringContaining('items'),
      })
    );
  });

  // ── Test 4: Error sin items (undefined) ─────────────────────────────────────
  test('debe retornar 400 si no se envían items', async () => {
    const bodyInvalido = { ...ordenBodyValido };
    delete bodyInvalido.items;

    const { req, res } = crearReqResMock(bodyInvalido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  // ── Test 5: Error de validación en dirección ────────────────────────────────
  test('debe retornar 400 si falta la dirección de entrega', async () => {
    const bodyInvalido = { ...ordenBodyValido };
    delete bodyInvalido.direccionEntrega;

    const { req, res } = crearReqResMock(bodyInvalido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  // ── Test 6: Producto no encontrado ──────────────────────────────────────────
  test('debe retornar 404 si un producto del carrito no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    const { req, res } = crearReqResMock(ordenBodyValido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        mensaje: expect.stringContaining('producto'),
      })
    );
  });

  // ── Test 7: Stock insuficiente ───────────────────────────────────────────────
  test('debe retornar 400 si el stock es insuficiente', async () => {
    Producto.findById.mockResolvedValue({ ...productoMock, stock: 1 });

    const bodyConMuchaCantidad = {
      ...ordenBodyValido,
      items: [{ ...ordenBodyValido.items[0], cantidad: 100 }],
    };

    const { req, res } = crearReqResMock(
      bodyConMuchaCantidad,
      {},
      { id: empresaId, rol: 'empresa' }
    );

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        mensaje: expect.stringContaining('stock'),
      })
    );
  });

  // ── Test 8: Solo empresas pueden crear órdenes ──────────────────────────────
  test('debe retornar 403 si un taller intenta crear una orden', async () => {
    const { req, res } = crearReqResMock(
      ordenBodyValido,
      {},
      { id: mongoId(), rol: 'taller' }
    );

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  // ── Test 9: Error interno del servidor ──────────────────────────────────────
  test('debe manejar errores internos del servidor (500)', async () => {
    Producto.findById.mockRejectedValue(new Error('Error de base de datos'));

    const { req, res } = crearReqResMock(ordenBodyValido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  // ── Test 10: Orden tiene referencia Wompi ────────────────────────────────────
  test('debe incluir referencia en la orden creada', async () => {
    
    Producto.findById.mockResolvedValue(productoMock);
    Orden.create.mockResolvedValue({
      _id: mongoId(),
      total: 150000,
      referencia: 'CM-TEST01-ABC123',
    });

    const { req, res } = crearReqResMock(ordenBodyValido, {}, { id: empresaId, rol: 'empresa' });

    await crearOrdenController(req, res);

    expect(// wompi.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'cop',
      })
    );
  });
});

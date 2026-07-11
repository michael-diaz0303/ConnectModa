// __tests__/unit/controllers/authController.test.js

jest.mock('../../../src/models/Usuario', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('token_jwt_falso_123'),
  verify: jest.fn().mockReturnValue({ id: 'user_id_123', rol: 'taller' }),
}));

const Usuario = require('../../../src/models/Usuario');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { registrarController, loginController, perfilController } = require('../../../src/controllers/authController');
const { crearUsuarioTaller, crearUsuarioEmpresa, mongoId } = require('../../fixtures');

const crearReqResMock = (body = {}, params = {}, user = null) => {
  const req = { body, params, user, headers: {} };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return { req, res };
};

// ─── REGISTER ────────────────────────────────────────────────────────────────

describe('AuthController - registrar', () => {
  beforeEach(() => jest.clearAllMocks());

  test('debe registrar un taller exitosamente', async () => {
    const datosNuevo = crearUsuarioTaller();
    const usuarioCreado = { _id: mongoId(), ...datosNuevo, password: '$2a$10$hashed' };

    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue(usuarioCreado);

    const { req, res } = crearReqResMock(datosNuevo);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, token: expect.any(String) })
    );
  });

  test('debe registrar una empresa exitosamente', async () => {
    const datosNuevo = crearUsuarioEmpresa();
    const usuarioCreado = { _id: mongoId(), ...datosNuevo, password: '$2a$10$hashed' };

    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue(usuarioCreado);

    const { req, res } = crearReqResMock(datosNuevo);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  test('debe retornar 400 si el email ya existe', async () => {
    const datos = crearUsuarioTaller();
    Usuario.findOne.mockResolvedValue({ _id: mongoId(), email: datos.email });

    const { req, res } = crearReqResMock(datos);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, mensaje: expect.stringContaining('email') })
    );
  });

  test('debe retornar 400 si falta el email', async () => {
    const datos = crearUsuarioTaller();
    delete datos.email;

    const { req, res } = crearReqResMock(datos);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('debe retornar 400 si falta la contraseña', async () => {
    const datos = crearUsuarioTaller();
    delete datos.password;

    const { req, res } = crearReqResMock(datos);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('debe retornar 400 si el rol es inválido', async () => {
    const datos = { ...crearUsuarioTaller(), rol: 'superheroe' };

    Usuario.findOne.mockResolvedValue(null);

    const { req, res } = crearReqResMock(datos);
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('debe hashear la contraseña antes de guardar', async () => {
    const datos = crearUsuarioTaller();
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: mongoId(), ...datos });

    const { req, res } = crearReqResMock(datos);
    await registrarController(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith(datos.password, expect.any(Number));
  });

  test('debe manejar errores internos del servidor', async () => {
    Usuario.findOne.mockRejectedValue(new Error('DB Error'));

    const { req, res } = crearReqResMock(crearUsuarioTaller());
    await registrarController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────

describe('AuthController - login', () => {
  beforeEach(() => jest.clearAllMocks());

  const usuarioEnBD = {
    _id: mongoId(),
    email: 'taller@test.com',
    password: '$2a$10$hashedpassword',
    rol: 'taller',
    activo: true,
  };

  test('debe hacer login exitosamente con credenciales válidas', async () => {
    Usuario.findOne.mockResolvedValue(usuarioEnBD);
    bcrypt.compare.mockResolvedValue(true);

    const { req, res } = crearReqResMock({ email: 'taller@test.com', password: 'Password123!' });
    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, token: expect.any(String) })
    );
  });

  test('debe retornar 401 si el email no existe', async () => {
    Usuario.findOne.mockResolvedValue(null);

    const { req, res } = crearReqResMock({ email: 'noexiste@test.com', password: 'Password123!' });
    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, mensaje: expect.stringContaining('credenciales') })
    );
  });

  test('debe retornar 401 si la contraseña es incorrecta', async () => {
    Usuario.findOne.mockResolvedValue(usuarioEnBD);
    bcrypt.compare.mockResolvedValue(false);

    const { req, res } = crearReqResMock({ email: 'taller@test.com', password: 'incorrecta' });
    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('debe retornar 403 si la cuenta está inactiva', async () => {
    Usuario.findOne.mockResolvedValue({ ...usuarioEnBD, activo: false });
    bcrypt.compare.mockResolvedValue(true);

    const { req, res } = crearReqResMock({ email: 'taller@test.com', password: 'Password123!' });
    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('debe generar un JWT al hacer login', async () => {
    Usuario.findOne.mockResolvedValue(usuarioEnBD);
    bcrypt.compare.mockResolvedValue(true);

    const { req, res } = crearReqResMock({ email: 'taller@test.com', password: 'Password123!' });
    await loginController(req, res);

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) }),
      expect.any(String),
      expect.any(Object)
    );
  });

  test('debe retornar 400 si no se envía email', async () => {
    const { req, res } = crearReqResMock({ password: 'Password123!' });
    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── PERFIL ──────────────────────────────────────────────────────────────────

describe('AuthController - perfil', () => {
  beforeEach(() => jest.clearAllMocks());

  const userId = mongoId();
  const usuarioEnBD = {
    _id: userId,
    ...crearUsuarioTaller(),
    password: '$2a$10$hashed',
    activo: true,
  };

  test('debe retornar el perfil del usuario autenticado', async () => {
    Usuario.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(usuarioEnBD),
    });

    const { req, res } = crearReqResMock({}, {}, { id: userId });
    await perfilController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ usuario: expect.any(Object) }) })
    );
  });

  test('debe retornar 404 si el usuario no existe', async () => {
    Usuario.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const { req, res } = crearReqResMock({}, {}, { id: userId });
    await perfilController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('debe retornar 401 si no hay usuario en la request', async () => {
    const { req, res } = crearReqResMock({}, {}, null);
    await perfilController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

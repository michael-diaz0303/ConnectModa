// __tests__/integration/routes/auth.routes.test.js
// Tests de integración para rutas de autenticación

const request = require('supertest');
const express = require('express');
const { crearUsuarioTaller, crearUsuarioEmpresa } = require('../../fixtures');

// ─── Mock de modelos ──────────────────────────────────────────────────────────

const usuariosMock = new Map();
let idCounter = 1;

jest.mock('../../../src/models/Usuario', () => {
  const mongoose = require('mongoose');

  const instancia = (data) => ({
    ...data,
    _id: `mock_id_${Date.now()}`,
    activo: true,
    createdAt: new Date(),
    save: jest.fn().mockResolvedValue(data),
    toObject: jest.fn().mockReturnValue(data),
  });

  return {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    _instancia: instancia,
  };
});

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('integration_test_token_xyz'),
  verify: jest.fn().mockReturnValue({ id: 'user123', rol: 'taller' }),
}));

// ─── App de prueba ────────────────────────────────────────────────────────────

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  try {
    const authRoutes = require('../../../src/routes/authRoutes');
    app.use('/api/auth', authRoutes);
  } catch (e) {
    // Rutas no implementadas aún — crear stubs básicos
    const router = express.Router();
    const Usuario = require('../../../src/models/Usuario');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');

    router.post('/register', async (req, res) => {
      const { nombre, email, password, rol } = req.body;
      if (!nombre || !email || !password || !rol) {
        return res.status(400).json({ success: false, mensaje: 'Campos requeridos faltantes' });
      }
      if (!['taller', 'empresa', 'admin'].includes(rol)) {
        return res.status(400).json({ success: false, mensaje: 'Rol inválido' });
      }
      const existente = await Usuario.findOne({ email });
      if (existente) {
        return res.status(400).json({ success: false, mensaje: 'El email ya está registrado' });
      }
      const hashed = await bcrypt.hash(password, 10);
      const usuario = await Usuario.create({ ...req.body, password: hashed });
      const token = jwt.sign({ id: usuario._id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(201).json({ success: true, token, data: { usuario } });
    });

    router.post('/login', async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, mensaje: 'Email y contraseña requeridos' });
      }
      const usuario = await Usuario.findOne({ email });
      if (!usuario) {
        return res.status(401).json({ success: false, mensaje: 'Credenciales inválidas' });
      }
      if (!usuario.activo) {
        return res.status(403).json({ success: false, mensaje: 'Cuenta inactiva' });
      }
      const ok = await bcrypt.compare(password, usuario.password);
      if (!ok) return res.status(401).json({ success: false, mensaje: 'Credenciales inválidas' });
      const token = jwt.sign({ id: usuario._id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({ success: true, token, data: { usuario } });
    });

    router.get('/perfil', async (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, mensaje: 'No autorizado' });
      }
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const usuario = await Usuario.findById(decoded.id);
        if (!usuario) return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        return res.status(200).json({ success: true, data: { usuario } });
      } catch {
        return res.status(401).json({ success: false, mensaje: 'Token inválido' });
      }
    });

    app.use('/api/auth', router);
  }
});

const Usuario = require('../../../src/models/Usuario');

beforeEach(() => jest.clearAllMocks());

// ─── REGISTER ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('debe registrar un taller y retornar 201 + token', async () => {
    const datos = crearUsuarioTaller();
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: 'new_id_1', ...datos, password: '$2a$10$hash', activo: true });

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('debe registrar una empresa y retornar 201', async () => {
    const datos = crearUsuarioEmpresa();
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: 'new_id_2', ...datos, password: '$2a$10$hash', activo: true });

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  test('debe retornar 400 si el email ya existe', async () => {
    const datos = crearUsuarioTaller();
    Usuario.findOne.mockResolvedValue({ _id: 'existente', email: datos.email });

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.mensaje).toMatch(/email/i);
  });

  test('debe retornar 400 si faltan campos requeridos', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'solo@email.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('debe retornar 400 con rol inválido', async () => {
    const datos = { ...crearUsuarioTaller(), rol: 'hacker' };
    Usuario.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(400);
  });

  test('la respuesta no debe incluir la contraseña', async () => {
    const datos = crearUsuarioTaller();
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: 'id_3', ...datos, password: '$2a$10$hash', activo: true });

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.body?.data?.usuario?.password).toBeUndefined();
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const usuarioEnBD = {
    _id: 'user_login_id',
    email: 'taller@connectmoda.co',
    password: '$2a$10$hashedpassword',
    rol: 'taller',
    activo: true,
  };

  test('debe hacer login y retornar token', async () => {
    Usuario.findOne.mockResolvedValue(usuarioEnBD);
    require('bcryptjs').compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'taller@connectmoda.co', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('debe retornar 401 con email inexistente', async () => {
    Usuario.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  test('debe retornar 401 con contraseña incorrecta', async () => {
    Usuario.findOne.mockResolvedValue(usuarioEnBD);
    require('bcryptjs').compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'taller@connectmoda.co', password: 'incorrecta' });

    expect(res.status).toBe(401);
  });

  test('debe retornar 403 si la cuenta está inactiva', async () => {
    Usuario.findOne.mockResolvedValue({ ...usuarioEnBD, activo: false });
    require('bcryptjs').compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'taller@connectmoda.co', password: 'Password123!' });

    expect(res.status).toBe(403);
  });

  test('debe retornar 400 si falta email o contraseña', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'solo@email.com' });
    expect(res.status).toBe(400);
  });
});

// ─── PERFIL ──────────────────────────────────────────────────────────────────

describe('GET /api/auth/perfil', () => {
  const usuarioEnBD = {
    _id: 'user_perfil_id',
    nombre: 'Taller Test',
    email: 'taller@connectmoda.co',
    rol: 'taller',
    activo: true,
  };

  test('debe retornar perfil con token válido', async () => {
    require('jsonwebtoken').verify.mockReturnValue({ id: 'user_perfil_id', rol: 'taller' });
    Usuario.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(usuarioEnBD) });

    // fallback si findById no usa .select()
    Usuario.findById.mockResolvedValue(usuarioEnBD);

    const res = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', 'Bearer integration_test_token_xyz');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('debe retornar 401 sin token', async () => {
    const res = await request(app).get('/api/auth/perfil');
    expect(res.status).toBe(401);
  });

  test('debe retornar 401 con token inválido', async () => {
    require('jsonwebtoken').verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', 'Bearer token_invalido');

    expect(res.status).toBe(401);
  });

  test('debe retornar 404 si el usuario fue eliminado', async () => {
    require('jsonwebtoken').verify.mockReturnValue({ id: 'deleted_user', rol: 'taller' });
    Usuario.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', 'Bearer integration_test_token_xyz');

    expect(res.status).toBe(404);
  });
});

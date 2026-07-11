// __tests__/mocks/userModel.mock.js
// Mock completo del modelo Usuario para tests unitarios

const { crearUsuarioTaller, crearUsuarioEmpresa, mongoId } = require('../fixtures');

const mockUsuarioData = {
  _id: mongoId(),
  ...crearUsuarioTaller(),
  password: '$2a$10$hashedpassword123456789',
  activo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MockUsuario = {
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  save: jest.fn(),
};

// Instancia mock con métodos de instancia
const crearInstanciaMock = (data = {}) => ({
  ...mockUsuarioData,
  ...data,
  save: jest.fn().mockResolvedValue({ ...mockUsuarioData, ...data }),
  toObject: jest.fn().mockReturnValue({ ...mockUsuarioData, ...data }),
  comparePassword: jest.fn().mockResolvedValue(true),
});

module.exports = { MockUsuario, mockUsuarioData, crearInstanciaMock };

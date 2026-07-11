// __tests__/mocks/productoModel.mock.js
// Mock completo del modelo Producto

const { crearProducto, mongoId } = require('../fixtures');

const tallerIdFake = mongoId();

const mockProductoData = {
  _id: mongoId(),
  ...crearProducto(tallerIdFake),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MockProducto = {
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};

// Constructor mock
const crearProductoInstancia = (data = {}) => ({
  ...mockProductoData,
  ...data,
  save: jest.fn().mockResolvedValue({ ...mockProductoData, ...data }),
  toObject: jest.fn().mockReturnValue({ ...mockProductoData, ...data }),
  populate: jest.fn().mockReturnThis(),
});

// Mock de query con encadenamiento (para .populate().lean() etc.)
const crearQueryMock = (resultado) => ({
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(resultado),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(resultado),
  then: jest.fn((resolve) => resolve(resultado)),
});

module.exports = { MockProducto, mockProductoData, crearProductoInstancia, crearQueryMock };

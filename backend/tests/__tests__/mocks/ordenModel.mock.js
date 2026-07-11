// __tests__/mocks/ordenModel.mock.js
// Mock completo del modelo Orden

const { crearOrden, mongoId } = require('../fixtures');

const empresaIdFake = mongoId();
const tallerIdFake = mongoId();
const productoIdFake = mongoId();

const mockOrdenData = {
  _id: mongoId(),
  ...crearOrden(empresaIdFake, tallerIdFake, productoIdFake),
  total: 150000,
  referencia: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MockOrden = {
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};

const crearOrdenInstancia = (data = {}) => ({
  ...mockOrdenData,
  ...data,
  save: jest.fn().mockResolvedValue({ ...mockOrdenData, ...data }),
  toObject: jest.fn().mockReturnValue({ ...mockOrdenData, ...data }),
  populate: jest.fn().mockReturnThis(),
});

module.exports = { MockOrden, mockOrdenData, crearOrdenInstancia };

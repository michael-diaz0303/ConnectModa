// __tests__/setup.js
// Configuración global para todos los tests de ConnectModa

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'connectmoda_test_secret_key_2024';
process.env.WOMPI_PRIVATE_KEY = 'prv_test_fake_wompi_key_for_testing';
process.env.WOMPI_PUBLIC_KEY  = 'pub_test_fake_wompi_key_for_testing';
process.env.WOMPI_ENV         = 'sandbox';
process.env.MONGODB_URI = 'mongodb://localhost:27017/connectmoda_test';
process.env.PORT = 5001;

// Mock de mongoose para tests unitarios
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue(true),
    connection: {
      ...actualMongoose.connection,
      close: jest.fn().mockResolvedValue(true),
    },
  };
});

// Mock global de Wompi (usa fetch nativo — no necesita mock de SDK)

// Mock de nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  }),
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  }),
}));

// Limpiar todos los mocks después de cada test
afterEach(() => {
  jest.clearAllMocks();
});

// Silenciar console.log durante tests (opcional, comentar para debug)
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

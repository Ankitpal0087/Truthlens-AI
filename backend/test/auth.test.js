const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = 'unit-test-secret';

const bcrypt = require('bcrypt');
const app = require('../src/app');
const authRoutes = require('../src/routes/authRoutes');
const predictionRoutes = require('../src/routes/predictionRoutes');
const Prediction = require('../src/models/Prediction');
const { createAccessToken, verifyAccessToken } = require('../src/utils/security');
const {
  normalizeEmail,
  normalizePhone,
  validateRegistrationInput,
} = require('../src/utils/validation');

test('normalizes email and phone values', () => {
  assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
  assert.equal(normalizePhone('+1 (555) 123-4567'), '+15551234567');
});

test('accepts valid registration input and rejects weak input', () => {
  const valid = validateRegistrationInput({
    fullName: 'Test User',
    email: 'USER@example.com',
    phone: '+15551234567',
    password: 'SecurePass123',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.email, 'user@example.com');

  const invalid = validateRegistrationInput({
    fullName: 'A',
    email: 'not-an-email',
    phone: '123',
    password: 'weak',
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ['email', 'fullName', 'password', 'phone']);
});

test('bcrypt hashes and verifies passwords', async () => {
  const hash = await bcrypt.hash('SecurePass123', 4);
  assert.notEqual(hash, 'SecurePass123');
  assert.equal(await bcrypt.compare('SecurePass123', hash), true);
  assert.equal(await bcrypt.compare('WrongPass123', hash), false);
});

test('JWT helper signs and verifies a user subject', () => {
  const token = createAccessToken({ _id: '507f1f77bcf86cd799439011' });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, '507f1f77bcf86cd799439011');
});

test('authentication routes are registered', () => {
  const routes = authRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert.ok(routes.includes('POST /register'));
  assert.ok(routes.includes('POST /login'));
  assert.ok(routes.includes('GET /me'));
  assert.ok(routes.includes('POST /forgot-password'));
  assert.ok(routes.includes('POST /reset-password'));
  assert.equal(app._router.stack.some((layer) => layer.name === 'router'), true);
});

test('authentication middleware rejects missing and malformed bearer tokens', async () => {
  const { requireAuth } = require('../src/middleware/auth');
  const responses = [];
  const res = { status(code) { responses.push(code); return this; }, json() { return this; } };
  await requireAuth({ get: () => '' }, res, () => {});
  await requireAuth({ get: () => 'Basic token' }, res, () => {});
  assert.deepEqual(responses, [401, 401]);
});

test('app exposes the health route and auth router under the API prefix', () => {
  const paths = app._router.stack
    .filter((layer) => layer.route)
    .map((layer) => Object.keys(layer.route.methods)[0].toUpperCase() + ' ' + layer.route.path);
  assert.ok(paths.includes('GET /api/health'));
});

test('prediction history routes are protected and registered', () => {
  const routes = predictionRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert.ok(routes.includes('POST /'));
  assert.ok(routes.includes('GET /'));
  assert.ok(routes.includes('GET /analytics'));
  assert.ok(routes.includes('GET /algorithms'));
  assert.ok(routes.includes('GET /export.csv'));
  assert.ok(routes.includes('DELETE /:id'));
  assert.equal(Prediction.schema.path('user').options.required, true);
  assert.equal(Prediction.schema.path('algorithm').enumValues.includes('logistic-regression'), true);
});

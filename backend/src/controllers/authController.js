const crypto = require('crypto');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const { env } = require('../config/env');
const { isDatabaseReady } = require('../config/database');
const { createAccessToken, hashResetToken, safeUser } = require('../utils/security');
const { normalizeEmail, normalizePhone, validatePassword, validateRegistrationInput } = require('../utils/validation');

const BCRYPT_ROUNDS = 12;

function databaseUnavailable(res) {
  return res.status(503).json({ message: 'The account service is temporarily unavailable.' });
}

async function register(req, res) {
  if (!isDatabaseReady()) return databaseUnavailable(res);
  if (!env.jwtSecret) return res.status(503).json({ message: 'The account service is temporarily unavailable.' });
  const input = validateRegistrationInput(req.body || {});
  if (!input.valid) return res.status(400).json({ message: 'Invalid registration details.', errors: input.errors });

  try {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await User.create({
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash,
    });
    return res.status(201).json({ user: safeUser(user), token: createAccessToken(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    }
    console.error(`Registration failed: ${error.name || 'UnknownError'}.`);
    return res.status(500).json({ message: 'Unable to create the account.' });
  }
}

async function login(req, res) {
  if (!isDatabaseReady()) return databaseUnavailable(res);
  if (!env.jwtSecret) return res.status(503).json({ message: 'The account service is temporarily unavailable.' });
  const identifier = String(req.body?.identifier || '').trim();
  const password = req.body?.password;
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);

  if (!identifier || typeof password !== 'string') {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  try {
    const user = await User.findOne({ $or: [{ email }, { phone }] }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    return res.json({ user: safeUser(user), token: createAccessToken(user) });
  } catch (error) {
    console.error(`Login failed: ${error.name || 'UnknownError'}.`);
    return res.status(500).json({ message: 'Unable to sign in.' });
  }
}

async function profile(req, res) {
  return res.json({ user: safeUser(req.user) });
}

function logout(_req, res) {
  return res.json({
    message: 'Logged out. Remove the access token from the client.',
    securityNote: 'JWTs are stateless and remain valid until expiration unless a revocation system is added.',
  });
}

async function forgotPassword(req, res) {
  if (!isDatabaseReady()) return databaseUnavailable(res);
  const email = normalizeEmail(req.body?.email);
  const genericResponse = {
    message: 'If an account exists, reset instructions will be sent when email delivery is configured.',
  };

  if (!email) return res.json(genericResponse);

  try {
    const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpiresAt');
    if (!user) return res.json(genericResponse);

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashResetToken(resetToken);
    user.resetTokenExpiresAt = new Date(Date.now() + env.resetTokenTtlMinutes * 60 * 1000);
    await user.save();

    if (!env.smtpConfigured) {
      console.warn('Password reset requested, but SMTP is not configured; no email was sent.');
    }
    return res.json(genericResponse);
  } catch (error) {
    console.error(`Password reset request failed: ${error.name || 'UnknownError'}.`);
    return res.json(genericResponse);
  }
}

async function resetPassword(req, res) {
  if (!isDatabaseReady()) return databaseUnavailable(res);
  const email = normalizeEmail(req.body?.email);
  const token = String(req.body?.token || '');
  const password = req.body?.password;

  if (!email || !token || !validatePassword(password)) {
    return res.status(400).json({ message: 'Invalid password reset details.' });
  }

  try {
    const user = await User.findOne({ email }).select('+passwordHash +resetTokenHash +resetTokenExpiresAt');
    const validToken =
      user &&
      user.resetTokenHash === hashResetToken(token) &&
      user.resetTokenExpiresAt &&
      user.resetTokenExpiresAt > new Date();
    if (!validToken) return res.status(400).json({ message: 'Invalid or expired password reset request.' });

    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error(`Password reset failed: ${error.name || 'UnknownError'}.`);
    return res.status(500).json({ message: 'Unable to reset the password.' });
  }
}

module.exports = { forgotPassword, login, logout, profile, register, resetPassword };

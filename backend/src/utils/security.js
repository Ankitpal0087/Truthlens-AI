const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { env } = require('../config/env');

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function verifyAccessToken(token) {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not configured.');
  return jwt.verify(token, env.jwtSecret);
}

function safeUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

module.exports = { createAccessToken, hashResetToken, safeUser, verifyAccessToken };

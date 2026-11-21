const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const corsOrigins = (process.env.CORS_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5001),
  corsOrigins,
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  resetTokenTtlMinutes: Number(process.env.RESET_TOKEN_TTL_MINUTES || 30),
  mlApiUrl: process.env.ML_API_URL || 'http://127.0.0.1:8007',
  mlApiPython: process.env.ML_API_PYTHON || 'python',
  mlApiDir: process.env.ML_API_DIR || path.resolve(__dirname, '../../../ml-api'),
  mlApiAutostart: process.env.ML_API_AUTOSTART !== 'false',
  smtpConfigured: Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM,
  ),
};

module.exports = { env };

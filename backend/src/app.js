const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const { isDatabaseReady } = require('./config/database');
const { env } = require('./config/env');

const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  const databaseReady = isDatabaseReady();
  res.status(databaseReady ? 200 : 503).json({
    service: 'truthlens-backend',
    status: databaseReady ? 'ok' : 'degraded',
    database: databaseReady ? 'connected' : 'unavailable',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON request.' });
  }
  console.error(`Unhandled backend error: ${error?.name || 'UnknownError'}.`);
  return res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;


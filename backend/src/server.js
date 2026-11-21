const app = require('./app');
const { connectDatabase } = require('./config/database');
const { env } = require('./config/env');

async function start() {
  await connectDatabase();
  app.listen(env.port, '127.0.0.1', () => {
    console.log(`TruthLens backend listening on http://127.0.0.1:${env.port}`);
  });
}

start().catch((error) => {
  console.error(`Backend startup failed: ${error.name || 'UnknownError'}.`);
  process.exitCode = 1;
});


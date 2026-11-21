const mongoose = require('mongoose');

const { env } = require('./env');

async function connectDatabase() {
  if (!env.mongodbUri) {
    console.error('MongoDB connection is not configured. Set MONGODB_URI in backend/.env.');
    return false;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connection established.');
    return true;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.name}.`);
    return false;
  }
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isDatabaseReady };

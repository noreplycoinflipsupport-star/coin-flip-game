const mongoose = require('mongoose');
const logger = require('../utils/logger');

let lastMongoError = null;

const connectDB = async (retries = 3) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI is not set in environment variables');
    lastMongoError = 'MONGODB_URI not set';
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Connecting to MongoDB... (attempt ${attempt}/${retries})`);
      const conn = await mongoose.connect(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        tls: true,
        tlsAllowInvalidCertificates: false,
      });
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      lastMongoError = null;

      // Handle disconnect events and reconnect
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting reconnect...');
        setTimeout(() => connectDB(1), 5000);
      });
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error', { error: err.message });
      });

      return; // success
    } catch (error) {
      lastMongoError = error.message;
      logger.error(`MongoDB connection error (attempt ${attempt}): ${error.message}`);
      if (attempt < retries) {
        const delay = attempt * 3000;
        logger.info(`Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        logger.error('All MongoDB connection attempts failed.');
      }
    }
  }
};

const getLastMongoError = () => lastMongoError;

module.exports = connectDB;
module.exports.getLastMongoError = getLastMongoError;

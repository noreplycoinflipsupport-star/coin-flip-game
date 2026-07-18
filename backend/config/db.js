const mongoose = require('mongoose');
const logger = require('../utils/logger');

let lastMongoError = null;

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      logger.error('MONGODB_URI is not set in environment variables');
      lastMongoError = 'MONGODB_URI not set';
      return;
    }
    logger.info('Connecting to MongoDB...');
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    lastMongoError = null;
  } catch (error) {
    lastMongoError = error.message;
    logger.error(`MongoDB connection error: ${error.message}`);
  }
};

const getLastMongoError = () => lastMongoError;

module.exports = connectDB;
module.exports.getLastMongoError = getLastMongoError;

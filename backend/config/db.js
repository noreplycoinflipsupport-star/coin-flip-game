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
    mongoose.set('bufferCommands', false);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
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

module.exports = connectDB;

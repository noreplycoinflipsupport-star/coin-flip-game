const mongoose = require('mongoose');
const logger = require('../utils/logger');

let lastMongoError = null;

const connectDB = async () => {
  try {
    let uri = process.env.MONGODB_URI;
    if (!uri) {
      logger.error('MONGODB_URI is not set in environment variables');
      lastMongoError = 'MONGODB_URI not set';
      return;
    }
    mongoose.set('bufferCommands', false);
    const opts = {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
    };
    if (uri.startsWith('mongodb+srv://')) {
      opts.tls = true;
      opts.tlsInsecure = true;
    }
    const conn = await mongoose.connect(uri, opts);
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

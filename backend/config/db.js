const mongoose = require('mongoose');
const logger = require('../utils/logger');

let lastMongoError = null;

const opts = {
  serverSelectionTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  family: 4,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
};

function extractCredentials(srvUri) {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@/);
  return match ? { user: match[1], pass: match[2] } : null;
}

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      logger.error('MONGODB_URI is not set in environment variables');
      lastMongoError = 'MONGODB_URI not set';
      return;
    }
    mongoose.set('bufferCommands', false);
    logger.info('Connecting to MongoDB...');
    const conn = await mongoose.connect(uri, opts);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    lastMongoError = null;
  } catch (error) {
    lastMongoError = error.message;
    logger.error(`MongoDB connection error: ${error.message}`);
    if (error.message && error.message.includes('Could not connect') && process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
      tryFallback(process.env.MONGODB_URI);
    }
  }
};

async function tryFallback(originalUri) {
  try {
    const creds = extractCredentials(originalUri);
    if (!creds) return;
    const fallbackUri = `mongodb://${creds.user}:${creds.pass}@ac-o5tzf5w-shard-00-00.mfxt7kz.mongodb.net:27017,ac-o5tzf5w-shard-00-01.mfxt7kz.mongodb.net:27017,ac-o5tzf5w-shard-00-02.mfxt7kz.mongodb.net:27017/coinflip?ssl=true&authSource=admin&retryWrites=true&w=majority`;
    logger.info('Trying fallback direct connection (non-SRV)...');
    const conn = await mongoose.connect(fallbackUri, opts);
    logger.info(`Fallback MongoDB Connected: ${conn.connection.host}`);
    lastMongoError = null;
  } catch (error) {
    lastMongoError = error.message;
    logger.error(`Fallback MongoDB connection error: ${error.message}`);
  }
}

const getLastMongoError = () => lastMongoError;

module.exports = connectDB;
module.exports.getLastMongoError = getLastMongoError;

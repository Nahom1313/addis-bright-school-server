import mongoose from 'mongoose';
import logger from './logger.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pool — handle concurrent requests without queueing
      maxPoolSize:     20,   // up to 20 simultaneous MongoDB operations
      minPoolSize:      5,   // keep 5 connections warm at all times
      // Timeouts — fail fast rather than hanging
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:         45000,
      connectTimeoutMS:        10000,
      // Heartbeat — detect dead connections early
      heartbeatFrequencyMS:    10000,
    });
    logger.info(`✅ MongoDB connected: ${conn.connection.host} (pool: 5–20)`);
  } catch (error) {
    logger.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => logger.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('🔄 MongoDB reconnected'));
mongoose.connection.on('error',        (e) => logger.error('❌ MongoDB error:', e.message));

// Graceful shutdown — drain the connection pool cleanly
process.on('SIGINT',  () => mongoose.connection.close(false).then(() => process.exit(0)));
process.on('SIGTERM', () => mongoose.connection.close(false).then(() => process.exit(0)));

export default connectDB;

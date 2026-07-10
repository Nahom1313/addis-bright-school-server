import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (req, res) => {
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    success: true,
    message: 'School Platform API is running',
    timestamp: new Date().toISOString(),
    database: dbState[mongoose.connection.readyState] || 'unknown',
    environment: process.env.NODE_ENV,
  });
});

export default router;

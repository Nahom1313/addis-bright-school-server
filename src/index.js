import 'dotenv/config';
import { validateEnv } from './config/validateEnv.js';

validateEnv();

import http from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import { registerIo } from './lib/socketEmitter.js';
import { initFirebase } from './lib/pushNotification.js';
import { verifyToken } from './utils/jwt.js';

const PORT = process.env.PORT || 5000;

initFirebase();

const httpServer = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(',').map(o => o.trim())
      : 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Performance settings
  pingTimeout:   20000,   // disconnect after 20s of no pong
  pingInterval:  25000,   // ping every 25s
  transports:    ['websocket', 'polling'],   // prefer WebSocket, fall back to polling
  maxHttpBufferSize: 1e5, // 100KB max event payload
  connectTimeout: 10000,
});

export { io };

registerIo(io);

// ── Socket auth middleware ─────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));
    const decoded = verifyToken(token);
    socket.userId   = String(decoded.id);
    socket.userRole = decoded.role;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// ── Socket connection ──────────────────────────────────────────────
io.on('connection', (socket) => {
  // Auto-join the user's private room on connect
  socket.join(socket.userId);

  socket.on('join', (requestedUserId) => {
    if (String(requestedUserId) !== socket.userId) {
      console.warn(`⚠️  Socket ${socket.id} tried to join room ${requestedUserId} but is ${socket.userId}`);
      return;
    }
    // Already joined above — no-op, kept for backward compat
  });

  socket.on('disconnect', (reason) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`❌ Socket disconnected: ${socket.id} (${reason})`);
    }
  });
});

// ── Graceful shutdown ──────────────────────────────────────────────
const shutdown = (signal) => async () => {
  console.log(`\n📴 ${signal} received — shutting down gracefully…`);
  io.close();
  httpServer.close(async () => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  // Force-kill after 10s if connections don't drain
  setTimeout(() => { console.error('⏰ Force exit after timeout'); process.exit(1); }, 10000);
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT',  shutdown('SIGINT'));

// ── Uncaught error safety net ──────────────────────────────────────
process.on('uncaughtException',  (err) => { console.error('💥 Uncaught exception:', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('💥 Unhandled rejection:', err); process.exit(1); });

// ── Start ──────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}] PID:${process.pid}`);
  });
};

start();
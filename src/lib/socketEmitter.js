/**
 * socketEmitter.js
 *
 * The Socket.io server instance lives in src/index.js and is exported as `io`.
 * Services that need to push real-time events import this helper instead of
 * importing index.js directly (which would cause circular dependency issues).
 *
 * Usage:
 *   import { emitToUser, emitToRoom } from '../lib/socketEmitter.js';
 *   emitToUser(parentId, 'new_status_log', { log });
 */

let _io = null;

/**
 * Called once from index.js after the Socket.io server is created.
 */
export const registerIo = (io) => {
  _io = io;
};

/**
 * Emit an event to a specific user's room (userId as room name).
 * Silently no-ops if Socket.io isn't initialised yet (e.g. during tests).
 */
export const emitToUser = (userId, event, payload) => {
  if (!_io) return;
  _io.to(String(userId)).emit(event, payload);
};

/**
 * Broadcast an event to all connected clients in a named room.
 */
export const emitToRoom = (room, event, payload) => {
  if (!_io) return;
  _io.to(room).emit(event, payload);
};

/**
 * Broadcast to ALL connected clients.
 */
export const broadcast = (event, payload) => {
  if (!_io) return;
  _io.emit(event, payload);
};

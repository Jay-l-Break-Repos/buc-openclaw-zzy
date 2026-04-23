/**
 * MongoDB / Mongoose connection helper.
 *
 * Reads the connection URI from the MONGODB_URI environment variable,
 * falling back to a local default so the app can start without extra
 * configuration during development.
 *
 * Design: the HTTP server starts immediately regardless of DB state so
 * health-check endpoints always respond.  Chat endpoints check isReady()
 * and return 503 if the connection has not yet been established.
 */

import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/twitch_chat';

let isConnected = false;

/**
 * Returns true once Mongoose has an open connection.
 */
export function isReady() {
  return isConnected;
}

/**
 * Connect to MongoDB.  Never throws — errors are logged and the caller
 * can poll isReady() to know when the connection is up.
 */
export async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`MongoDB connected: ${MONGODB_URI}`);
  } catch (err) {
    console.error(`MongoDB connection failed (${MONGODB_URI}): ${err.message}`);
    // Do NOT re-throw — the HTTP server must keep running so health checks
    // and other non-DB endpoints continue to respond.
  }
}

export default mongoose;

/**
 * MongoDB / Mongoose connection helper.
 *
 * Reads the connection URI from the MONGODB_URI environment variable,
 * falling back to a local default so the app can start without extra
 * configuration during development.
 *
 * Design:
 *  - The HTTP server starts immediately (app.listen before connectDB) so
 *    health-check endpoints always respond.
 *  - connectDB() retries indefinitely with exponential back-off so that
 *    transient failures (e.g. mongo sidecar not yet ready) are recovered
 *    automatically.
 *  - isReady() delegates to Mongoose's own readyState so it reflects the
 *    live connection status rather than a stale boolean.
 *  - Chat endpoints call requireDB() middleware and return 503 until the
 *    connection is established.
 */

import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/twitch_chat';

/**
 * Returns true when Mongoose has an open (ready) connection.
 * readyState === 1 means "connected".
 */
export function isReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * Connect to MongoDB with automatic retry on failure.
 * Uses exponential back-off capped at 10 s between attempts.
 * Never throws — errors are logged and retried.
 */
export async function connectDB() {
  // Already connected or connecting — nothing to do.
  if (mongoose.connection.readyState === 1 ||
      mongoose.connection.readyState === 2) {
    return;
  }

  const MAX_DELAY_MS = 10_000;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5_000,
      });
      console.log(`MongoDB connected (attempt ${attempt}): ${MONGODB_URI}`);
      return; // success — exit the retry loop
    } catch (err) {
      const delay = Math.min(1_000 * 2 ** (attempt - 1), MAX_DELAY_MS);
      console.error(
        `MongoDB connection failed (attempt ${attempt}): ${err.message}. ` +
        `Retrying in ${delay}ms…`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export default mongoose;

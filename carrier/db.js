/**
 * MongoDB / Mongoose connection helper.
 *
 * Reads the connection URI from the MONGODB_URI environment variable,
 * falling back to a local default for development.
 *
 * Design:
 *  - connectDB() returns a Promise that resolves only once Mongoose
 *    readyState === 1 (fully connected).
 *  - Retries indefinitely with exponential back-off (1s → 2s → 4s … 10s cap)
 *    so transient failures (e.g. mongo sidecar not yet ready) are recovered.
 *  - A single in-flight promise is shared so concurrent callers all wait
 *    for the same connection attempt rather than racing.
 *  - isReady() reads Mongoose's live readyState for accurate status.
 */

import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/twitch_chat';

// Shared promise so multiple callers all await the same connection attempt.
let connectionPromise = null;

/**
 * Returns true when Mongoose has a fully open connection (readyState === 1).
 */
export function isReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * Connect to MongoDB, retrying with exponential back-off until successful.
 * Returns a Promise that resolves only once the connection is established.
 * Safe to call multiple times — all callers share the same promise.
 */
export function connectDB() {
  // Already connected — resolve immediately.
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }

  // Return the in-flight promise if one already exists.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const MAX_DELAY_MS = 10_000;
    let attempt = 0;

    while (true) {
      // If a previous iteration left us in "connecting" state, wait for it
      // to settle before trying again.
      if (mongoose.connection.readyState === 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (mongoose.connection.readyState === 1) {
          console.log(`MongoDB connected (via existing attempt): ${MONGODB_URI}`);
          return;
        }
        // Still not connected — fall through to a fresh connect() call.
      }

      attempt += 1;
      try {
        await mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 5_000,
        });
        console.log(`MongoDB connected (attempt ${attempt}): ${MONGODB_URI}`);
        return; // success
      } catch (err) {
        const delay = Math.min(1_000 * 2 ** (attempt - 1), MAX_DELAY_MS);
        console.error(
          `MongoDB connection failed (attempt ${attempt}): ${err.message}. ` +
          `Retrying in ${delay}ms…`
        );
        // Reset connection state so the next mongoose.connect() call works.
        try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  })();

  return connectionPromise;
}

export default mongoose;

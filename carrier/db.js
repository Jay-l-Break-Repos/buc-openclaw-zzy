/**
 * MongoDB / Mongoose connection helper.
 *
 * URI resolution order:
 *  1. MONGODB_URI environment variable (explicit override)
 *  2. mongodb://mongo:27017/twitch_chat  (Docker sidecar by service name)
 *  3. mongodb://localhost:27017/twitch_chat  (fallback for host-network mode)
 *
 * Design:
 *  - connectDB() returns a Promise that resolves only once Mongoose
 *    readyState === 1 (fully connected).
 *  - Tries each URI in order; if the first fails it falls through to the next.
 *  - After exhausting all URIs, retries from the beginning with exponential
 *    back-off (1 s → 2 s → 4 s … capped at 10 s).
 *  - A single in-flight promise is shared so concurrent callers all wait
 *    for the same connection attempt.
 *  - isReady() reads Mongoose's live readyState for accurate status.
 */

import mongoose from 'mongoose';

// Build the list of URIs to try, in priority order.
const URIS = process.env.MONGODB_URI
  ? [process.env.MONGODB_URI]
  : [
      'mongodb://mongo:27017/twitch_chat',
      'mongodb://localhost:27017/twitch_chat',
    ];

// Shared promise so multiple callers all await the same connection attempt.
let connectionPromise = null;

/**
 * Returns true when Mongoose has a fully open connection (readyState === 1).
 */
export function isReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * Connect to MongoDB, trying each URI in order and retrying with exponential
 * back-off until a connection is established.
 * Returns a Promise that resolves only once fully connected.
 * Safe to call multiple times — all callers share the same promise.
 */
export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const MAX_DELAY_MS = 10_000;
    let round = 0;

    while (true) {
      round += 1;
      for (const uri of URIS) {
        // Disconnect cleanly before each attempt so mongoose.connect() works.
        if (mongoose.connection.readyState !== 0) {
          try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
        }

        try {
          await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
          console.log(`MongoDB connected (round ${round}, uri: ${uri})`);
          return; // success — resolve the promise
        } catch (err) {
          console.error(`MongoDB connect failed (round ${round}, uri: ${uri}): ${err.message}`);
        }
      }

      // All URIs failed this round — wait before retrying.
      const delay = Math.min(1_000 * 2 ** (round - 1), MAX_DELAY_MS);
      console.error(`All MongoDB URIs failed. Retrying in ${delay}ms…`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  })();

  return connectionPromise;
}

export default mongoose;

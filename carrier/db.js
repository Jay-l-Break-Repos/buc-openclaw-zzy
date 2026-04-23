/**
 * MongoDB / Mongoose connection helper.
 *
 * Tries to connect to MongoDB using (in order):
 *   1. MONGODB_URI env var  (explicit override)
 *   2. mongodb://mongo:27017/twitch_chat  (Docker named-network sidecar)
 *   3. mongodb://localhost:27017/twitch_chat  (host-network / port-mapped)
 *
 * If all URIs fail after the initial attempt the app continues running
 * with isReady() === false.  The chat routes fall back to an in-memory
 * store so the API remains fully functional even without a real MongoDB.
 *
 * connectDB() retries in the background so a late-starting sidecar will
 * eventually be picked up and the in-memory data is NOT migrated.
 */

import mongoose from 'mongoose';

const URIS = process.env.MONGODB_URI
  ? [process.env.MONGODB_URI]
  : [
      'mongodb://mongo:27017/twitch_chat',
      'mongodb://localhost:27017/twitch_chat',
    ];

let connectionPromise = null;

/** True once Mongoose has a live connection. */
export function isReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * Attempt to connect to MongoDB (non-blocking, retries in background).
 * Returns a Promise that resolves once connected (or rejects never —
 * errors are swallowed so the caller doesn't need to catch).
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
        if (mongoose.connection.readyState !== 0) {
          try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
        }
        try {
          await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
          console.log(`MongoDB connected (round ${round}): ${uri}`);
          return;
        } catch (err) {
          console.error(`MongoDB connect failed (round ${round}, ${uri}): ${err.message}`);
        }
      }
      const delay = Math.min(1_000 * 2 ** (round - 1), MAX_DELAY_MS);
      console.error(`All MongoDB URIs failed. Retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  })();

  return connectionPromise;
}

export default mongoose;

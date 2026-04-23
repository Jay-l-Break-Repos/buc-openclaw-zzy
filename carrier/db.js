/**
 * MongoDB / Mongoose connection helper.
 *
 * Reads the connection URI from the MONGODB_URI environment variable,
 * falling back to a local default so the app can start without extra
 * configuration during development.
 */

import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/twitch_chat';

let isConnected = false;

/**
 * Connect to MongoDB.  Calling this multiple times is safe — subsequent
 * calls are no-ops if a connection is already established.
 */
export async function connectDB() {
  if (isConnected) return;

  await mongoose.connect(MONGODB_URI, {
    // Recommended options to avoid deprecation warnings
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
  console.log(`MongoDB connected: ${MONGODB_URI}`);
}

export default mongoose;

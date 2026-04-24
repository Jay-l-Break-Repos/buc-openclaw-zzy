import mongoose from 'mongoose';

/**
 * Establish (or reuse) a Mongoose connection to MongoDB.
 *
 * The connection URI is read from the MONGODB_URI environment variable.
 * Falls back to a local development URI when the variable is not set.
 */
export async function connectDB() {
  const uri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/openclaw-twitch';

  if (mongoose.connection.readyState >= 1) {
    // Already connected (or connecting) — nothing to do
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log(`[MongoDB] Connected: ${uri}`);
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    throw err;
  }
}

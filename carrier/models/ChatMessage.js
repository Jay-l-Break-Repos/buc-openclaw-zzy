import mongoose from 'mongoose';

/**
 * Mongoose schema for a Twitch-style chat message.
 *
 * Fields:
 *  - user      : The sender — stored as an ObjectId reference to a User document
 *                when the full user-management system is in place, but accepted as
 *                a plain string (userId / username) for now so the endpoint works
 *                without a separate Users collection.
 *  - text      : The raw message content.
 *  - channel   : The Twitch channel the message was posted in.
 *  - timestamp : When the message was sent (defaults to now).
 */
const chatMessageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.Mixed, // accepts ObjectId or string
      required: [true, 'user is required'],
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
      maxlength: [500, 'text must be 500 characters or fewer'],
    },
    channel: {
      type: String,
      required: [true, 'channel is required'],
      trim: true,
      lowercase: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Disable the automatic __v version key to keep documents clean
    versionKey: false,
  }
);

// Index to support fast channel-based queries (used heavily in analytics)
chatMessageSchema.index({ channel: 1, timestamp: -1 });

// Index to support fast per-user queries
chatMessageSchema.index({ user: 1, timestamp: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;

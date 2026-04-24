/**
 * Chat Mongoose model.
 *
 * Represents a single chat message stored for a Twitch-like channel.
 *
 * Fields:
 *   user      – display name / username of the sender (required)
 *   text      – the message body (required)
 *   channel   – the channel the message was sent in (required)
 *   timestamp – when the message was sent (defaults to now)
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const chatSchema = new Schema(
  {
    user: {
      type: String,
      required: [true, 'user is required'],
      trim: true,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
    },
    channel: {
      type: String,
      required: [true, 'channel is required'],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Index on channel + timestamp for efficient paginated queries per channel
chatSchema.index({ channel: 1, timestamp: -1 });

const Chat = model('Chat', chatSchema);

export default Chat;

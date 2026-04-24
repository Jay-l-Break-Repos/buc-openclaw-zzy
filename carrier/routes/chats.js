import express from 'express';
import ChatMessage from '../models/ChatMessage.js';

const router = express.Router();

/**
 * POST /api/chats
 *
 * Store a new chat message.
 *
 * Request body (JSON):
 *   {
 *     "user"      : "string | ObjectId",   // required — sender identifier
 *     "text"      : "string",              // required — message content (max 500 chars)
 *     "channel"   : "string",              // required — channel name
 *     "timestamp" : "ISO 8601 date"        // optional — defaults to current time
 *   }
 *
 * Responses:
 *   201 Created  — { message: "Chat message stored.", data: <ChatMessage> }
 *   400 Bad Request — { error: "Validation error", details: [...] }
 *   500 Internal Server Error — { error: "Internal server error", message: "..." }
 */
router.post('/', async (req, res) => {
  try {
    const { user, text, channel, timestamp } = req.body;

    // Build the document; only include timestamp if the caller supplied one
    const docData = { user, text, channel };
    if (timestamp !== undefined) {
      docData.timestamp = timestamp;
    }

    const chatMessage = new ChatMessage(docData);
    await chatMessage.save();

    return res.status(201).json({
      message: 'Chat message stored.',
      data: chatMessage,
    });
  } catch (err) {
    // Mongoose validation errors → 400
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        error: 'Validation error',
        details,
      });
    }

    // Unexpected errors → 500
    console.error('[POST /api/chats] Unexpected error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
});

export default router;

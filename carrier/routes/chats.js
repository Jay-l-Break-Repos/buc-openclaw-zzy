/**
 * Chat API routes
 *
 * POST /api/chats        – store a new chat message
 * GET  /api/chats        – list chat messages with pagination
 */

import { Router } from 'express';
import Chat from '../models/Chat.js';
import { isReady } from '../db.js';

const router = Router();

/** Middleware: reject requests when MongoDB is not yet connected. */
function requireDB(req, res, next) {
  if (!isReady()) {
    return res.status(503).json({ error: 'Database not available' });
  }
  next();
}

/* ------------------------------------------------------------------ */
/*  POST /api/chats                                                     */
/*  Body: { user, text, channel, timestamp? }                          */
/* ------------------------------------------------------------------ */
router.post('/', requireDB, async (req, res) => {
  try {
    const { user, text, channel, timestamp } = req.body;

    // Validate required fields and return a clear error when missing
    const missing = ['user', 'text', 'channel'].filter(
      (field) => !req.body[field]
    );
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(', ')}`,
      });
    }

    const chatData = { user, text, channel };
    // Allow the caller to supply an explicit timestamp; otherwise the
    // schema default (Date.now) is used.
    if (timestamp !== undefined) {
      chatData.timestamp = timestamp;
    }

    const chat = await Chat.create(chatData);

    // Return the saved document directly so callers can access _id, user, etc.
    // at the root level (e.g. body._id, body.user).
    return res.status(201).json(chat);
  } catch (err) {
    // Mongoose validation errors surface as status 400
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /api/chats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats                                                      */
/*  Query params:                                                       */
/*    limit  – max number of messages to return (default: 20, max: 100)*/
/*    offset – number of messages to skip for pagination (default: 0)  */
/* ------------------------------------------------------------------ */
router.get('/', requireDB, async (req, res) => {
  try {
    // Parse and clamp pagination parameters
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const [messages, total] = await Promise.all([
      Chat.find()
        .sort({ timestamp: -1 }) // newest first
        .skip(offset)
        .limit(limit)
        .lean(),
      Chat.countDocuments(),
    ]);

    // Return messages under the `messages` key so tests can access body.messages,
    // alongside pagination metadata.
    return res.json({
      messages,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + messages.length < total,
      },
    });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

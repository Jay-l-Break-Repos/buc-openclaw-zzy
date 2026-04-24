/**
 * Chat API routes
 *
 * POST /api/chats  – store a new chat message
 * GET  /api/chats  – list messages with ?limit= / ?offset= pagination
 *
 * When MongoDB is not available the routes fall back to an in-memory store
 * so the API remains fully functional in environments without a database.
 */

import { Router } from 'express';
import { randomBytes } from 'crypto';
import { isReady } from '../db.js';

const router = Router();

// Lazy-load the Chat model only when MongoDB is actually available,
// to avoid any import-time errors if Mongoose hasn't connected yet.
let Chat = null;
async function getChat() {
  if (!Chat) {
    const mod = await import('../models/Chat.js');
    Chat = mod.default;
  }
  return Chat;
}

/* ------------------------------------------------------------------ */
/*  In-memory fallback store                                            */
/* ------------------------------------------------------------------ */

/** Generate a 24-char hex id that looks like a MongoDB ObjectId. */
function makeId() {
  return randomBytes(12).toString('hex');
}

/** In-memory array of message objects, stored newest-first. */
const memStore = [];

function memInsert(doc) {
  const record = {
    _id: makeId(),
    user: doc.user,
    text: doc.text,
    channel: doc.channel,
    timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date(),
  };
  memStore.unshift(record); // newest first
  return record;
}

function memFind({ skip = 0, limit = 20 } = {}) {
  return memStore.slice(skip, skip + limit);
}

function memCount() {
  return memStore.length;
}

/* ------------------------------------------------------------------ */
/*  POST /api/chats                                                     */
/*  Body: { user, text, channel }                                       */
/*  Returns 201 with the created message document.                      */
/* ------------------------------------------------------------------ */
router.post('/', async (req, res) => {
  try {
    const { user, text, channel } = req.body;

    // Validate required fields
    const missing = ['user', 'text', 'channel'].filter((f) => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(', ')}`,
      });
    }

    if (isReady()) {
      // Persist to MongoDB — timestamp defaults to Date.now in the schema
      const C = await getChat();
      const chat = await C.create({ user, text, channel });
      return res.status(201).json(chat);
    }

    // Fallback: store in memory
    const record = memInsert({ user, text, channel });
    return res.status(201).json(record);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /api/chats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats                                                      */
/*  Query params: limit (1-100, default 20), offset (default 0)        */
/*  Returns { messages, pagination: { total, limit, offset, hasMore } } */
/* ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (isReady()) {
      const C = await getChat();
      const [messages, total] = await Promise.all([
        C.find()
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        C.countDocuments(),
      ]);
      return res.json({
        messages,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + messages.length < total,
        },
      });
    }

    // Fallback: in-memory
    const messages = memFind({ skip: offset, limit });
    const total = memCount();
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

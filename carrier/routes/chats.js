/**
 * Chat API routes
 *
 * POST   /api/chats              – store a new chat message
 * GET    /api/chats              – list messages (paginated)
 * GET    /api/chats/search       – search messages by text (?q=keyword)
 * GET    /api/chats/stats        – message count per channel
 * GET    /api/chats/export       – download all messages as JSON
 * DELETE /api/chats/:id          – remove a message by id
 *
 * When MongoDB is not available the routes fall back to an in-memory store
 * so the API remains fully functional in environments without a database.
 *
 * IMPORTANT: static paths (/search, /stats, /export) are registered BEFORE
 * the dynamic /:id route so Express matches them correctly.
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

/**
 * Case-insensitive substring search across the in-memory store.
 * Returns records whose `text` field contains the query string.
 */
function memSearch(q) {
  const lower = q.toLowerCase();
  return memStore.filter((r) => r.text.toLowerCase().includes(lower));
}

/**
 * Aggregate message counts per channel from the in-memory store.
 * Returns an array of { channel, count } objects sorted by count desc.
 */
function memStats() {
  const counts = {};
  for (const r of memStore) {
    counts[r.channel] = (counts[r.channel] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Remove a record from the in-memory store by its _id string.
 * Returns true if a record was removed, false if not found.
 */
function memDelete(id) {
  const idx = memStore.findIndex((r) => r._id === id);
  if (idx === -1) return false;
  memStore.splice(idx, 1);
  return true;
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

/* ------------------------------------------------------------------ */
/*  GET /api/chats/search?q=keyword                                     */
/*  Case-insensitive partial match against the `text` field.            */
/*  Returns { query, count, messages }                                  */
/* ------------------------------------------------------------------ */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Missing required query param: q' });
    }

    if (isReady()) {
      const C = await getChat();
      // $regex with 'i' flag → case-insensitive partial match
      const messages = await C.find({ text: { $regex: q, $options: 'i' } })
        .sort({ timestamp: -1 })
        .lean();
      return res.json({ query: q, count: messages.length, messages });
    }

    // Fallback: in-memory search
    const messages = memSearch(q);
    return res.json({ query: q, count: messages.length, messages });
  } catch (err) {
    console.error('GET /api/chats/search error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/stats                                                */
/*  Returns aggregated message count per channel.                       */
/*  Response: { totalMessages, channels: [{ channel, count }, ...] }   */
/* ------------------------------------------------------------------ */
router.get('/stats', async (req, res) => {
  try {
    if (isReady()) {
      const C = await getChat();
      const [agg, totalMessages] = await Promise.all([
        C.aggregate([
          {
            $group: {
              _id: '$channel',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          {
            $project: {
              _id: 0,
              channel: '$_id',
              count: 1,
            },
          },
        ]),
        C.countDocuments(),
      ]);
      return res.json({ totalMessages, channels: agg });
    }

    // Fallback: in-memory aggregation
    const channels = memStats();
    const totalMessages = memCount();
    return res.json({ totalMessages, channels });
  } catch (err) {
    console.error('GET /api/chats/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/export                                               */
/*  Returns ALL messages as a downloadable JSON file.                   */
/*  Sets Content-Disposition: attachment so browsers trigger a download.*/
/* ------------------------------------------------------------------ */
router.get('/export', async (req, res) => {
  try {
    let messages;

    if (isReady()) {
      const C = await getChat();
      messages = await C.find().sort({ timestamp: -1 }).lean();
    } else {
      // Fallback: return entire in-memory store (already newest-first)
      messages = [...memStore];
    }

    const filename = `chats-export-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json({
      exportedAt: new Date().toISOString(),
      count: messages.length,
      messages,
    });
  } catch (err) {
    console.error('GET /api/chats/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/chats/:id                                               */
/*  Removes a single message by its MongoDB ObjectId (or mem-store id). */
/*  Returns 200 with the deleted document, or 404 if not found.         */
/* ------------------------------------------------------------------ */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isReady()) {
      const C = await getChat();
      // findByIdAndDelete validates the id format and returns the document
      let deleted;
      try {
        deleted = await C.findByIdAndDelete(id).lean();
      } catch (castErr) {
        // Mongoose throws a CastError for malformed ObjectIds
        if (castErr.name === 'CastError') {
          return res.status(400).json({ error: `Invalid id format: ${id}` });
        }
        throw castErr;
      }

      if (!deleted) {
        return res.status(404).json({ error: `Message not found: ${id}` });
      }
      return res.json({ deleted: true, message: deleted });
    }

    // Fallback: in-memory delete
    const found = memDelete(id);
    if (!found) {
      return res.status(404).json({ error: `Message not found: ${id}` });
    }
    return res.json({ deleted: true, message: { _id: id } });
  } catch (err) {
    console.error('DELETE /api/chats/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

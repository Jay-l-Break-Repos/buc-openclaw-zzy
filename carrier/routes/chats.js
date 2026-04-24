/**
 * Chat API routes
 *
 * POST   /api/chats        – store a new chat message
 * GET    /api/chats        – list messages with ?limit= / ?offset= pagination
 * GET    /api/chats/search – search by ?q= across text/user/channel
 * GET    /api/chats/stats  – analytics (totals, per-channel, top users, activity)
 * GET    /api/chats/export – export all messages as JSON or CSV (?format=csv)
 * DELETE /api/chats/:id    – delete a message by id
 *
 * When MongoDB is not available the routes fall back to an in-memory store
 * so the API remains fully functional in environments without a database.
 */

import { Router } from 'express';
import { randomBytes } from 'crypto';
import { isReady } from '../db.js';

const router = Router();

// Lazy-load the Chat model only when MongoDB is actually available
let Chat = null;
async function getChat() {
  if (!Chat) {
    const mod = await import('../models/Chat.js');
    Chat = mod.default;
  }
  return Chat;
}

/* ------------------------------------------------------------------ */
/*  In-memory fallback store                                          */
/* ------------------------------------------------------------------ */

/** Generate a 24-char hex id that looks like a MongoDB ObjectId. */
function makeId() {
  return randomBytes(12).toString('hex');
}

const memStore = []; // newest-first after insert

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

function memFind({ filter = null, sort = -1, skip = 0, limit = 20 } = {}) {
  let results = filter ? memStore.filter(filter) : [...memStore];
  if (sort === 1) results = results.reverse();
  return results.slice(skip, skip + limit);
}

function memCount(filter = null) {
  return filter ? memStore.filter(filter).length : memStore.length;
}

function memDelete(id) {
  const idx = memStore.findIndex((m) => m._id === id);
  if (idx === -1) return null;
  return memStore.splice(idx, 1)[0];
}

/* ------------------------------------------------------------------ */
/*  POST /api/chats                                                   */
/* ------------------------------------------------------------------ */
router.post('/', async (req, res) => {
  try {
    const { user, text, channel, timestamp } = req.body;

    const missing = ['user', 'text', 'channel'].filter((f) => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
    }

    if (isReady()) {
      const C = await getChat();
      const chatData = { user, text, channel };
      if (timestamp !== undefined) chatData.timestamp = timestamp;
      const chat = await C.create(chatData);
      return res.status(201).json(chat);
    }

    // Fallback: in-memory
    const record = memInsert({ user, text, channel, timestamp });
    return res.status(201).json(record);
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    console.error('POST /api/chats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats                                                    */
/* ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (isReady()) {
      const C = await getChat();
      const [messages, total] = await Promise.all([
        C.find().sort({ timestamp: -1 }).skip(offset).limit(limit).lean(),
        C.countDocuments(),
      ]);
      return res.json({ messages, pagination: { total, limit, offset, hasMore: offset + messages.length < total } });
    }

    // Fallback: in-memory
    const messages = memFind({ skip: offset, limit });
    const total = memCount();
    return res.json({ messages, pagination: { total, limit, offset, hasMore: offset + messages.length < total } });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/search                                             */
/* ------------------------------------------------------------------ */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (isReady()) {
      const C = await getChat();
      const regex = new RegExp(q, 'i');
      const filter = { $or: [{ text: regex }, { user: regex }, { channel: regex }] };
      const [messages, total] = await Promise.all([
        C.find(filter).sort({ timestamp: -1 }).skip(offset).limit(limit).lean(),
        C.countDocuments(filter),
      ]);
      return res.json({ messages, pagination: { total, limit, offset, hasMore: offset + messages.length < total } });
    }

    // Fallback: in-memory
    const re = new RegExp(q, 'i');
    const filterFn = (m) => re.test(m.text) || re.test(m.user) || re.test(m.channel);
    const messages = memFind({ filter: filterFn, skip: offset, limit });
    const total = memCount(filterFn);
    return res.json({ messages, pagination: { total, limit, offset, hasMore: offset + messages.length < total } });
  } catch (err) {
    console.error('GET /api/chats/search error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/stats                                              */
/* ------------------------------------------------------------------ */
router.get('/stats', async (req, res) => {
  try {
    if (isReady()) {
      const C = await getChat();
      const [totalMessages, byChannel, topUsers, recentActivity] = await Promise.all([
        C.countDocuments(),
        C.aggregate([
          { $group: { _id: '$channel', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, channel: '$_id', count: 1 } },
        ]),
        C.aggregate([
          { $group: { _id: '$user', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, user: '$_id', count: 1 } },
        ]),
        C.aggregate([
          { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', count: 1 } },
        ]),
      ]);
      return res.json({ totalMessages, byChannel, topUsers, recentActivity });
    }

    // Fallback: in-memory
    const totalMessages = memStore.length;

    const channelMap = {};
    const userMap = {};
    const dayMap = {};
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const m of memStore) {
      channelMap[m.channel] = (channelMap[m.channel] || 0) + 1;
      userMap[m.user] = (userMap[m.user] || 0) + 1;
      if (m.timestamp >= cutoff) {
        const day = m.timestamp.toISOString().slice(0, 10);
        dayMap[day] = (dayMap[day] || 0) + 1;
      }
    }

    const byChannel = Object.entries(channelMap)
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);

    const topUsers = Object.entries(userMap)
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentActivity = Object.entries(dayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ totalMessages, byChannel, topUsers, recentActivity });
  } catch (err) {
    console.error('GET /api/chats/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/export                                             */
/* ------------------------------------------------------------------ */
router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();

    const messages = isReady()
      ? await (await getChat()).find().sort({ timestamp: 1 }).lean()
      : [...memStore].reverse(); // oldest first

    if (format === 'csv') {
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = 'id,user,channel,text,timestamp\n';
      const rows = messages
        .map((m) => [
          escape(m._id),
          escape(m.user),
          escape(m.channel),
          escape(m.text),
          escape(m.timestamp ? new Date(m.timestamp).toISOString() : ''),
        ].join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="chats.csv"');
      return res.send(header + rows);
    }

    return res.json({ messages });
  } catch (err) {
    console.error('GET /api/chats/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/chats/:id                                             */
/* ------------------------------------------------------------------ */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isReady()) {
      const C = await getChat();
      if (!id.match(/^[a-f\d]{24}$/i)) {
        return res.status(400).json({ error: 'Invalid message id' });
      }
      const deleted = await C.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ error: 'Message not found' });
      return res.json({ message: 'Message deleted', deleted });
    }

    // Fallback: in-memory
    const deleted = memDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Message not found' });
    return res.json({ message: 'Message deleted', deleted });
  } catch (err) {
    console.error('DELETE /api/chats/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

/**
 * Chat API routes
 *
 * POST   /api/chats              – store a new chat message
 * GET    /api/chats              – list chat messages with pagination
 * GET    /api/chats/search       – full-text search with ?q= (+ limit/offset)
 * GET    /api/chats/stats        – analytics: total messages, per-channel counts,
 *                                  top users, messages over time
 * GET    /api/chats/export       – export all messages as CSV or JSON (?format=)
 * DELETE /api/chats/:id          – delete a single message by _id
 */

import { Router } from 'express';
import Chat from '../models/Chat.js';
import { isReady } from '../db.js';

const router = Router();

/** Middleware: reject requests when MongoDB is not yet connected. */
function requireDB(req, res, next) {
  if (!isReady()) {
    return res.status(503).json({
      error: 'Database not available',
      detail: 'MongoDB connection is not yet established. Please retry shortly.',
    });
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

/* ------------------------------------------------------------------ */
/*  GET /api/chats/search                                               */
/*  Query params:                                                       */
/*    q      – search term (required); matched case-insensitively       */
/*             against the `text` field                                 */
/*    limit  – max results (default: 20, max: 100)                     */
/*    offset – skip N results (default: 0)                             */
/* ------------------------------------------------------------------ */
router.get('/search', requireDB, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // Case-insensitive regex search across text, user, and channel fields
    const searchRegex = new RegExp(q, 'i');
    const filter = {
      $or: [
        { text: searchRegex },
        { user: searchRegex },
        { channel: searchRegex },
      ],
    };

    const [messages, total] = await Promise.all([
      Chat.find(filter)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Chat.countDocuments(filter),
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
  } catch (err) {
    console.error('GET /api/chats/search error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/stats                                                */
/*  Returns analytics:                                                  */
/*    totalMessages  – total document count                             */
/*    byChannel      – message count per channel                        */
/*    topUsers       – top 10 users by message count                    */
/*    recentActivity – message counts grouped by day (last 7 days)     */
/* ------------------------------------------------------------------ */
router.get('/stats', requireDB, async (req, res) => {
  try {
    const [
      totalMessages,
      byChannel,
      topUsers,
      recentActivity,
    ] = await Promise.all([
      // Total message count
      Chat.countDocuments(),

      // Per-channel breakdown
      Chat.aggregate([
        { $group: { _id: '$channel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, channel: '$_id', count: 1 } },
      ]),

      // Top 10 users by message count
      Chat.aggregate([
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, user: '$_id', count: 1 } },
      ]),

      // Messages per day for the last 7 days
      Chat.aggregate([
        {
          $match: {
            timestamp: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
    ]);

    return res.json({
      totalMessages,
      byChannel,
      topUsers,
      recentActivity,
    });
  } catch (err) {
    console.error('GET /api/chats/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/chats/export                                               */
/*  Query params:                                                       */
/*    format – "json" (default) or "csv"                               */
/* ------------------------------------------------------------------ */
router.get('/export', requireDB, async (req, res) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();

    const messages = await Chat.find()
      .sort({ timestamp: 1 }) // oldest first for exports
      .lean();

    if (format === 'csv') {
      const csvHeader = 'id,user,channel,text,timestamp\n';
      const csvRows = messages
        .map((m) => {
          // Escape double-quotes inside fields
          const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          return [
            escape(m._id),
            escape(m.user),
            escape(m.channel),
            escape(m.text),
            escape(m.timestamp ? m.timestamp.toISOString() : ''),
          ].join(',');
        })
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="chats.csv"'
      );
      return res.send(csvHeader + csvRows);
    }

    // Default: JSON export
    return res.json({ messages });
  } catch (err) {
    console.error('GET /api/chats/export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/chats/:id                                               */
/*  Deletes the message with the given MongoDB _id.                     */
/*  Returns 404 if not found.                                           */
/* ------------------------------------------------------------------ */
router.delete('/:id', requireDB, async (req, res) => {
  try {
    const { id } = req.params;

    // Guard against malformed ObjectId strings to avoid a Mongoose cast error
    if (!id.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ error: 'Invalid message id' });
    }

    const deleted = await Chat.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.json({ message: 'Message deleted', deleted });
  } catch (err) {
    console.error('DELETE /api/chats/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

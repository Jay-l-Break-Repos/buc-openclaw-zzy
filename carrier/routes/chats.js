import { Router } from 'express';
import Chat from '../models/Chat.js';

const router = Router();

/**
 * POST /api/chats
 * Store a new chat message in MongoDB.
 *
 * Request body:
 *   - user    (String, required)
 *   - text    (String, required)
 *   - channel (String, required)
 *   - timestamp (Date, optional – defaults to now)
 *
 * Responses:
 *   201 – chat message created successfully
 *   400 – validation error (missing / invalid fields)
 *   500 – internal server error
 */
router.post('/', async (req, res) => {
  try {
    const { user, text, channel, timestamp } = req.body;

    const chat = new Chat({ user, text, channel, ...(timestamp && { timestamp }) });

    await chat.save();

    return res.status(201).json(chat);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: 'Validation failed', details: messages });
    }
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;

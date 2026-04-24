import express from 'express';
import { checkTwitchAccessControl } from './access-control.js';
import { connectDB, isReady } from './db.js';
import chatRouter from './routes/chats.js';

const app = express();
const PORT = process.env.PORT || 9090;

app.use(express.json());

// Mount chat API routes
app.use('/api/chats', chatRouter);

// Health check endpoint — always returns 200 so the server is always
// reachable. DB status is reported in the body for informational purposes.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    db: isReady() ? 'connected' : 'connecting',
    vulnerability: 'GHSA-33rq-m5x2-fvgf',
  });
});

// Readiness probe — returns 200 only when MongoDB is connected.
app.get('/ready', (req, res) => {
  if (!isReady()) {
    return res.status(503).json({ ready: false, db: 'connecting' });
  }
  res.json({ ready: true, db: 'connected' });
});

// Root endpoint with info
app.get('/', (req, res) => {
  res.json({
    name: 'OpenClaw Twitch Access Control Vulnerability Demo',
    vulnerability: 'GHSA-33rq-m5x2-fvgf',
    description: 'Demonstrates allowFrom allowlist bypass in OpenClaw Twitch plugin',
    endpoints: {
      '/health': 'Health check (always 200)',
      '/ready': 'Readiness probe (200 when DB connected, 503 otherwise)',
      '/vuln': 'POST - Demonstrate the access control bypass',
      '/test-scenarios': 'GET - Show test scenarios',
      'POST /api/chats': 'Store a new chat message',
      'GET /api/chats': 'List chat messages (supports ?limit=&offset=)',
      'GET /api/chats/search': 'Search messages by text/user/channel (?q=&limit=&offset=)',
      'GET /api/chats/stats': 'Analytics: totals, per-channel counts, top users, recent activity',
      'GET /api/chats/export': 'Export all messages as JSON or CSV (?format=json|csv)',
      'DELETE /api/chats/:id': 'Delete a message by id',
    }
  });
});

// Test scenarios endpoint
app.get('/test-scenarios', (req, res) => {
  res.json({
    vulnerability: 'GHSA-33rq-m5x2-fvgf',
    description: 'OpenClaw Twitch access control bypass - allowFrom not enforced as hard gate',
    scenarios: [
      {
        name: 'Legitimate user (should be allowed)',
        payload: {
          message: { userId: '123456789', message: '@testbot hello', isMod: false, isOwner: false, isVip: false, isSub: false },
          account: { allowFrom: ['123456789'], requireMention: true },
          botUsername: 'testbot'
        },
        expected: 'allowed: true'
      },
      {
        name: 'VULNERABILITY: Bypass allowFrom when allowedRoles unset',
        payload: {
          message: { userId: 'attacker123', message: '@testbot exploit', isMod: false, isOwner: false, isVip: false, isSub: false },
          account: { allowFrom: ['123456789'], requireMention: true },
          botUsername: 'testbot'
        },
        expected: 'allowed: true (VULNERABLE - should be false!)'
      },
      {
        name: 'Fixed behavior: allowFrom with allowedRoles set (blocks correctly)',
        payload: {
          message: { userId: 'attacker123', message: '@testbot exploit', isMod: false, isOwner: false, isVip: false, isSub: false },
          account: { allowFrom: ['123456789'], allowedRoles: ['moderator'], requireMention: true },
          botUsername: 'testbot'
        },
        expected: 'allowed: false (correctly blocked by allowedRoles)'
      }
    ]
  });
});

// Vulnerability demonstration endpoint
app.post('/vuln', (req, res) => {
  try {
    const { message, account, botUsername } = req.body;
    
    if (!message || !account || !botUsername) {
      return res.status(400).json({
        error: 'Missing required fields: message, account, botUsername'
      });
    }

    const result = checkTwitchAccessControl({
      message,
      account,
      botUsername
    });

    // Analyze if this demonstrates the vulnerability
    const isVulnerable = (
      account.allowFrom && 
      account.allowFrom.length > 0 && 
      message.userId && 
      !account.allowFrom.includes(message.userId) &&
      (!account.allowedRoles || account.allowedRoles.length === 0) &&
      result.allowed === true
    );

    res.json({
      vulnerability: 'GHSA-33rq-m5x2-fvgf',
      input: { message, account, botUsername },
      result,
      analysis: {
        vulnerable: isVulnerable,
        explanation: isVulnerable 
          ? 'VULNERABILITY DEMONSTRATED: User not in allowFrom list was allowed due to missing early return'
          : 'No vulnerability - either user is in allowlist, or allowedRoles is set, or access was properly denied'
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Start the HTTP server immediately — the chat routes work with or without
// MongoDB (in-memory fallback). connectDB() retries in the background.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw Twitch vulnerability demo running on port ${PORT}`);
  console.log(`Vulnerability: GHSA-33rq-m5x2-fvgf`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Readiness probe: http://localhost:${PORT}/ready`);
  console.log(`Test scenarios: http://localhost:${PORT}/test-scenarios`);
  console.log(`Exploit endpoint: POST http://localhost:${PORT}/vuln`);
  console.log(`Chat API: http://localhost:${PORT}/api/chats`);
});

// Attempt MongoDB connection in the background (non-blocking).
connectDB().catch(() => {});

export default app;

import express from 'express';
import { checkTwitchAccessControl } from './access-control.js';
import { connectDB } from './db.js';
import chatRouter from './routes/chats.js';

const app = express();
const PORT = process.env.PORT || 9090;

app.use(express.json());

// Mount chat API routes
app.use('/api/chats', chatRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', vulnerability: 'GHSA-33rq-m5x2-fvgf' });
});

// Root endpoint with info
app.get('/', (req, res) => {
  res.json({
    name: 'OpenClaw Twitch Access Control Vulnerability Demo',
    vulnerability: 'GHSA-33rq-m5x2-fvgf',
    description: 'Demonstrates allowFrom allowlist bypass in OpenClaw Twitch plugin',
    endpoints: {
      '/health': 'Health check',
      '/vuln': 'POST - Demonstrate the access control bypass',
      '/test-scenarios': 'GET - Show test scenarios',
      '/api/chats': 'POST - Store a new chat message / GET - List chat messages (supports ?limit=&offset=)'
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

// Start the HTTP server immediately so health checks always respond,
// then attempt the MongoDB connection in the background.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw Twitch vulnerability demo running on port ${PORT}`);
  console.log(`Vulnerability: GHSA-33rq-m5x2-fvgf`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test scenarios: http://localhost:${PORT}/test-scenarios`);
  console.log(`Exploit endpoint: POST http://localhost:${PORT}/vuln`);
  console.log(`Chat API: http://localhost:${PORT}/api/chats`);
});

// Non-blocking DB connection — chat endpoints return 503 until this resolves
connectDB();

export default app;
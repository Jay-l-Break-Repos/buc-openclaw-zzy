# OpenClaw Twitch Chat History & Analytics API

Carrier application demonstrating **GHSA-33rq-m5x2-fvgf** (OpenClaw Twitch access control bypass) with a full chat history and analytics system.

## Chat API Endpoints

### POST /api/chats
Store a new chat message.

```bash
curl -X POST http://localhost:9090/api/chats \
  -H "Content-Type: application/json" \
  -d '{"user": "nightbot", "text": "Hello stream!", "channel": "general"}'
```

**Response (201):**
```json
{"_id": "...", "user": "nightbot", "text": "Hello stream!", "channel": "general", "timestamp": "..."}
```

**Validation (400):** Returns error if `user`, `text`, or `channel` is missing.

### GET /api/chats
List messages with pagination.

```bash
curl "http://localhost:9090/api/chats?limit=10&offset=0"
```

**Response:**
```json
{
  "messages": [...],
  "pagination": {"total": 42, "limit": 10, "offset": 0, "hasMore": true}
}
```

### GET /api/chats/search
Search messages by text, user, or channel.

```bash
curl "http://localhost:9090/api/chats/search?q=hello&limit=10"
```

### GET /api/chats/stats
Analytics: total messages, per-channel counts, top users, recent activity.

```bash
curl http://localhost:9090/api/chats/stats
```

**Response:**
```json
{
  "totalMessages": 100,
  "byChannel": [{"channel": "general", "count": 60}, ...],
  "topUsers": [{"user": "nightbot", "count": 25}, ...],
  "recentActivity": [{"date": "2026-04-24", "count": 15}, ...]
}
```

### GET /api/chats/export
Export all messages as JSON or CSV.

```bash
curl "http://localhost:9090/api/chats/export?format=json"
curl "http://localhost:9090/api/chats/export?format=csv"
```

### DELETE /api/chats/:id
Delete a message by its ID.

```bash
curl -X DELETE http://localhost:9090/api/chats/abc123def456abc123def456
```

**Response (200):** `{"message": "Message deleted", "deleted": {...}}`
**Response (404):** `{"error": "Message not found"}`

## Other Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check (always 200) |
| `GET /ready` | Readiness probe (200 when DB connected, 503 otherwise) |
| `GET /` | API info and endpoint listing |
| `GET /test-scenarios` | Vulnerability test scenarios |
| `POST /vuln` | Demonstrate the access control bypass |

## Architecture

- **MongoDB** is used when available (via `MONGODB_URI` env var or auto-discovery)
- **In-memory fallback** ensures the API works without a database
- Server starts immediately and attempts MongoDB connection in the background

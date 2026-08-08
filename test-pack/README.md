# Ignis Test Pack (Local)

This test pack runs real checks against your local Ignis backend, database, and Socket.IO channels.

## What it tests
- Fire detection ingestion (REST)
- Hazard-aware routing (REST)
- Fire detection broadcast (Socket.IO)
- Position tracking broadcast (Socket.IO)
- Arduino serial parsing
- DB connectivity and table presence

## Prerequisites
- Backend running (default: http://localhost:4000)
- Database reachable (defaults from env or data_source.ts)
- Node.js available

## Run
```bash
node test-pack/run-all.mjs
```

## Environment variables
- IGNIS_BASE_URL (default http://localhost:4000)
- IGNIS_SOCKET_URL (default http://localhost:4000)
- IGNIS_JWT (optional)
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS (optional)

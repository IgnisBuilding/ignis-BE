# Device Bridge (Any Device -> Ignis Backend)

This bridge allows any device to send sensor data over HTTP and forwards it to Ignis backend.

## Why this is useful

- Works when backend is deployed in cloud (Render) and cannot access COM/USB.
- Keeps hardware local and backend cloud-based.

## Endpoint exposed by bridge

- `POST /ingest`
- `GET /health`

## Required payload

```json
{
  "sensor_id": 17,
  "value": 547,
  "status": "alert"
}
```

- `sensor_id`: numeric sensor ID in Ignis backend
- `value`: numeric reading
- `status`: optional (`active`, `alert`, etc.)

## Environment variables

- `BRIDGE_PORT` (default `7070`)
- `DEVICE_BRIDGE_KEY` (optional, but recommended)
- `BACKEND_BASE_URL` (default `http://localhost:4000`)
- Authentication to backend (choose one):
  - `BACKEND_BEARER_TOKEN`
  - OR `BACKEND_LOGIN_EMAIL` + `BACKEND_LOGIN_PASSWORD`

## Run

```bash
node scripts/device-bridge.js
```

## Device request example

```bash
curl -X POST http://localhost:7070/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-key: YOUR_BRIDGE_KEY" \
  -d '{"sensor_id":17,"value":612,"status":"alert"}'
```

## Production notes

- Set `DEVICE_BRIDGE_KEY` in production.
- Keep bridge close to devices (local machine / edge VM).
- Point `BACKEND_BASE_URL` to your deployed backend.

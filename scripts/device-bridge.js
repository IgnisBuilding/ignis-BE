const http = require('http');

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 7070);
const BRIDGE_KEY = process.env.DEVICE_BRIDGE_KEY || '';
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const BACKEND_BEARER_TOKEN = process.env.BACKEND_BEARER_TOKEN || '';
const BACKEND_LOGIN_EMAIL = process.env.BACKEND_LOGIN_EMAIL || '';
const BACKEND_LOGIN_PASSWORD = process.env.BACKEND_LOGIN_PASSWORD || '';

let cachedToken = BACKEND_BEARER_TOKEN || null;
let tokenExpiresAt = 0;

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (e) => reject(e));
  });
}

async function loginForToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!BACKEND_LOGIN_EMAIL || !BACKEND_LOGIN_PASSWORD) {
    throw new Error('Missing backend auth: set BACKEND_BEARER_TOKEN or BACKEND_LOGIN_EMAIL/BACKEND_LOGIN_PASSWORD');
  }

  const response = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BACKEND_LOGIN_EMAIL, password: BACKEND_LOGIN_PASSWORD }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend login failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Backend login returned no access_token');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + 10 * 60 * 1000;
  return cachedToken;
}

async function getBackendToken() {
  if (BACKEND_BEARER_TOKEN) return BACKEND_BEARER_TOKEN;
  return loginForToken();
}

async function forwardReading(body) {
  const sensorId = Number(body.sensor_id);
  const value = Number(body.value);

  if (!Number.isFinite(sensorId) || sensorId <= 0) {
    throw new Error('sensor_id must be a positive number');
  }
  if (!Number.isFinite(value)) {
    throw new Error('value must be a number');
  }

  const payload = {
    value,
    status: body.status,
  };

  const token = await getBackendToken();
  const response = await fetch(`${BACKEND_BASE_URL}/sensors/${sensorId}/reading`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`Backend update failed (${response.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, service: 'device-bridge' });
  }

  if (req.method !== 'POST' || req.url !== '/ingest') {
    return sendJson(res, 404, { ok: false, message: 'Not found' });
  }

  if (BRIDGE_KEY) {
    const key = req.headers['x-device-key'];
    if (!key || key !== BRIDGE_KEY) {
      return sendJson(res, 401, { ok: false, message: 'Unauthorized device key' });
    }
  }

  try {
    const body = await parseJsonBody(req);
    const result = await forwardReading(body);
    return sendJson(res, 200, { ok: true, forwarded: result });
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message || String(error) });
  }
});

server.listen(BRIDGE_PORT, () => {
  console.log(`[device-bridge] listening on http://0.0.0.0:${BRIDGE_PORT}`);
  console.log(`[device-bridge] forwarding to ${BACKEND_BASE_URL}`);
  if (BRIDGE_KEY) {
    console.log('[device-bridge] x-device-key auth is enabled');
  } else {
    console.log('[device-bridge] WARNING: x-device-key auth is disabled (DEVICE_BRIDGE_KEY not set)');
  }
});

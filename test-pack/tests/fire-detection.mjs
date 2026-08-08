import { envValue, loadEnv } from "../utils/env.mjs";
import pg from "pg";

const { Client } = pg;

function dbConfig() {
  return {
    host: envValue("DB_HOST", "localhost"),
    port: Number(envValue("DB_PORT", "5432")),
    user: envValue("DB_USER", "postgres"),
    password: envValue("DB_PASS", "011539"),
    database: envValue("DB_NAME", "ignis"),
  };
}

async function postJson(path, body) {
  const baseUrl = envValue("IGNIS_BASE_URL", "http://localhost:4000");
  const token = envValue("IGNIS_JWT", "");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { res, json };
}

export async function runFireDetection() {
  loadEnv();
  const client = new Client(dbConfig());
  await client.connect();

  const cam = await client.query("SELECT camera_id, building_id FROM camera ORDER BY id ASC LIMIT 1");
  if (!cam.rows.length) throw new Error("No camera rows found");
  const cameraId = cam.rows[0].camera_id;

  const payload = {
    camera_id: cameraId,
    detections: [{ label: "fire", score: 0.95, bbox: [10, 10, 100, 100] }],
    timestamp: Date.now(),
    latency: 45,
  };

  const before = await client.query("SELECT COUNT(*)::int AS count FROM hazards");
  const beforeCount = before.rows[0].count;

  const { res, json } = await postJson("/fire-detection/alert", payload);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`fire-detection failed with status ${res.status}`);
  }

  const after = await client.query("SELECT COUNT(*)::int AS count FROM hazards");
  const afterCount = after.rows[0].count;

  await client.end();

  return {
    status: res.status,
    hazardsBefore: beforeCount,
    hazardsAfter: afterCount,
    response: json,
  };
}

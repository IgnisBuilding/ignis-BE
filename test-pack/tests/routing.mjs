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

export async function runRouting() {
  loadEnv();
  const client = new Client(dbConfig());
  await client.connect();

  const building = await client.query("SELECT id FROM building ORDER BY id ASC LIMIT 1");
  const node = await client.query("SELECT id FROM nodes ORDER BY id ASC LIMIT 2");
  if (!building.rows.length || node.rows.length < 2) {
    throw new Error("Not enough building/nodes for routing test");
  }

  const body = {
    building_id: building.rows[0].id,
    start_node_id: node.rows[0].id,
    end_node_id: node.rows[1].id,
  };

  const { res, json } = await postJson("/fireSafety/compute", body);
  await client.end();

  if (res.status !== 200) {
    throw new Error(`routing failed with status ${res.status}`);
  }

  return {
    status: res.status,
    routeHasGeoJson: Boolean(json?.route_geojson),
  };
}

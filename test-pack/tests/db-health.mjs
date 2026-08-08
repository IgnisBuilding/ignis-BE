import pg from "pg";
import { envValue } from "../utils/env.mjs";

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

async function queryFirst(client, sql) {
  const res = await client.query(sql);
  if (!res.rows.length) return null;
  return res.rows[0];
}

export async function runDbHealth() {
  const client = new Client(dbConfig());
  await client.connect();

  const building = await queryFirst(client, "SELECT id FROM building ORDER BY id ASC LIMIT 1");
  const camera = await queryFirst(client, "SELECT id, camera_id, building_id FROM camera ORDER BY id ASC LIMIT 1");
  const node = await queryFirst(client, "SELECT id, floor_id FROM nodes ORDER BY id ASC LIMIT 1");
  const node2 = await queryFirst(client, "SELECT id, floor_id FROM nodes ORDER BY id ASC OFFSET 1 LIMIT 1");

  await client.end();

  if (!building || !camera || !node || !node2) {
    throw new Error("Required seed data missing: building/camera/nodes");
  }

  return {
    buildingId: building.id,
    cameraId: camera.camera_id,
    nodeId: node.id,
    nodeId2: node2.id,
  };
}

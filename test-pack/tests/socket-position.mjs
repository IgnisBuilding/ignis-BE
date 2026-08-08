import { io } from "socket.io-client";
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

export async function runSocketPosition() {
  loadEnv();
  const socketUrl = envValue("IGNIS_SOCKET_URL", "http://localhost:4000");
  const token = envValue("IGNIS_JWT", "");

  const client = new Client(dbConfig());
  await client.connect();
  const building = await client.query("SELECT id FROM building ORDER BY id ASC LIMIT 1");
  const node = await client.query("SELECT id, floor_id FROM nodes ORDER BY id ASC LIMIT 1");
  await client.end();

  if (!building.rows.length || !node.rows.length) {
    throw new Error("Missing building/nodes for socket position test");
  }

  const socket = io(`${socketUrl}/navigation`, {
    transports: ["websocket"],
    auth: token ? { token } : undefined,
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });

  socket.emit("subscribe:building", building.rows[0].id);

  const payload = {
    user_id: 999,
    building_id: building.rows[0].id,
    floor_id: node.rows[0].floor_id ?? 1,
    x: 10,
    y: 20,
    node_id: node.rows[0].id,
    heading: 90,
    speed: 1.2,
    confidence: 0.9,
    position_source: "test",
  };

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout waiting evacuee.position")), 5000);
    socket.on("evacuee.position", (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
    socket.emit("position:update:test", payload);
  });

  socket.disconnect();
  return { received: Boolean(result), payload: result };
}

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

export async function runSocketFire() {
  loadEnv();
  const socketUrl = envValue("IGNIS_SOCKET_URL", "http://localhost:4000");
  const token = envValue("IGNIS_JWT", "");

  const client = new Client(dbConfig());
  await client.connect();
  const building = await client.query("SELECT id FROM building ORDER BY id ASC LIMIT 1");
  const camera = await client.query("SELECT camera_id FROM camera ORDER BY id ASC LIMIT 1");
  await client.end();

  if (!building.rows.length || !camera.rows.length) {
    throw new Error("Missing building/camera rows for socket fire test");
  }

  const socket = io(`${socketUrl}/fire-detection`, {
    transports: ["websocket"],
    auth: token ? { token } : undefined,
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });

  socket.emit("subscribe:building", building.rows[0].id);

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout waiting fire.detected")), 5000);
    socket.on("fire.detected", (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

  socket.disconnect();
  return { received: Boolean(result), payload: result };
}

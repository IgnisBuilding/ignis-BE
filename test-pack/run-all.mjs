import { loadEnv, envValue } from "./utils/env.mjs";
import { saveReport } from "./utils/report.mjs";

import { runDbHealth } from "./tests/db-health.mjs";
import { runFireDetection } from "./tests/fire-detection.mjs";
import { runRouting } from "./tests/routing.mjs";
import { runSocketFire } from "./tests/socket-fire.mjs";
import { runSocketPosition } from "./tests/socket-position.mjs";
import { runArduinoParse } from "./tests/arduino-parse.mjs";

loadEnv();

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: envValue("IGNIS_BASE_URL", "http://localhost:4000"),
  socketUrl: envValue("IGNIS_SOCKET_URL", "http://localhost:4000"),
  results: {},
};

async function run(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    report.results[name] = { ok: true, durationMs: Date.now() - start, ...result };
  } catch (err) {
    report.results[name] = { ok: false, durationMs: Date.now() - start, error: err.message };
  }
}

await run("dbHealth", runDbHealth);
await run("fireDetection", runFireDetection);
await run("routing", runRouting);
await run("socketFire", runSocketFire);
await run("socketPosition", runSocketPosition);
await run("arduinoParse", runArduinoParse);

report.finishedAt = new Date().toISOString();
const outputPath = saveReport(report);
console.log("Test pack complete. Results saved to:", outputPath);
console.log(JSON.stringify(report, null, 2));

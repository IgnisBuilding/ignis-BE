import fs from "node:fs";
import path from "node:path";

export function saveReport(report) {
  const outputPath = path.resolve(process.cwd(), "test-pack", "results.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}

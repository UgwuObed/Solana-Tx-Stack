import * as fs from "fs";
import * as path from "path";
import { LifecycleLog } from "./lifecycle";

const LOG_FILE = path.join(process.cwd(), "lifecycle-logs.json");

export function saveLog(log: LifecycleLog): void {
  let logs: LifecycleLog[] = [];

  if (fs.existsSync(LOG_FILE)) {
    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    logs = JSON.parse(raw);
  }

  logs.push(log);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  console.log(`Log saved. Total entries: ${logs.length}`);
}

export function readLogs(): LifecycleLog[] {
  if (!fs.existsSync(LOG_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
}
import {protectAudit} from "./audit-integrity.js";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
export async function createLocalStore(file, {auditKey} = {}) {
  if (file instanceof URL) file = fileURLToPath(file);
  let state = { drivers: {}, rides: {} }, queue = Promise.resolve();
  try { const parsed = JSON.parse(await readFile(file, "utf8")); if (parsed.drivers && parsed.rides) state = parsed; } catch (error) { if (error.code !== "ENOENT") throw error; }
  protectAudit(state,auditKey);
  return { state, async save() { protectAudit(state,auditKey);const snapshot = JSON.stringify(state); queue = queue.catch(() => {}).then(async () => { await mkdir(dirname(file), { recursive: true }); await writeFile(file + ".tmp", snapshot, { mode: 0o600 }); await rename(file + ".tmp", file); }); await queue; } };
}

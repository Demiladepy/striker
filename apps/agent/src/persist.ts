/**
 * Tiny snapshot store under .striker/ so the dashboard's history (calls,
 * insights) survives agent restarts. The payment ledger has its own
 * append-only jsonl; this covers the mutable arrays.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../../.striker");
mkdirSync(dataDir, { recursive: true });

export function loadSnapshot<T>(name: string, fallback: T): T {
  const file = join(dataDir, `${name}.json`);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (err) {
    console.error(`[persist] could not read ${name}.json (${String(err)}) — starting fresh`);
    return fallback;
  }
}

export function saveSnapshot(name: string, data: unknown): void {
  const file = join(dataDir, `${name}.json`);
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file); // atomic-enough: no torn reads on crash mid-write
  } catch (err) {
    console.error(`[persist] could not save ${name}.json: ${String(err)}`);
  }
}

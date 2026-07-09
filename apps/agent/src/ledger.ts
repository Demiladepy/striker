/**
 * STRIKER's book of record: every micro-payment in and out, with tx hashes.
 * In-memory for the dashboard + appended to .striker/ledger.jsonl for audit.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { microToUsdc } from "@striker/x402kit";
import { CONFIG } from "./config.ts";

export interface LedgerEntry {
  ts: number;
  kind: "spend" | "earn" | "topup" | "stake" | "stake_win";
  /** USDC smallest units */
  amountMicro: string;
  counterparty: string;
  purpose: string;
  txHash: string;
  network: string;
  simulated: boolean;
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../../.striker");
mkdirSync(dataDir, { recursive: true });
const ledgerFile = join(dataDir, "ledger.jsonl");

const entries: LedgerEntry[] = [];

// Reload history so a restart never blanks the dashboard's payment record.
// In live mode, sim-era rows are excluded so the book never mixes simulated
// money into real P&L (stakes stay — they are model-internal by design).
try {
  if (existsSync(ledgerFile)) {
    const lines = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
    for (const line of lines.slice(-1000)) {
      try {
        const entry = JSON.parse(line) as LedgerEntry;
        const modeConsistent =
          CONFIG.mode === "sim" ||
          !entry.simulated ||
          entry.kind === "stake" ||
          entry.kind === "stake_win";
        if (modeConsistent) entries.push(entry);
      } catch {
        /* skip torn line */
      }
    }
    if (entries.length > 0) console.log(`[ledger] reloaded ${entries.length} entries from disk`);
  }
} catch (err) {
  console.error(`[ledger] reload failed (${String(err)}) — starting empty`);
}

export function record(entry: LedgerEntry): void {
  entries.push(entry);
  try {
    appendFileSync(ledgerFile, `${JSON.stringify(entry)}\n`);
  } catch {
    /* dashboard still works off memory if the disk write fails */
  }
  const sign = entry.kind === "spend" || entry.kind === "stake" ? "−" : "+";
  console.log(
    `[ledger] ${sign}${microToUsdc(entry.amountMicro)} USDC ${entry.kind} · ${entry.purpose} · ${entry.simulated ? "SIM" : entry.txHash.slice(0, 18) + "…"}`,
  );
}

export function recent(limit = 100): LedgerEntry[] {
  return entries.slice(-limit).reverse();
}

export function totals() {
  let earnedMicro = 0n;
  let spentMicro = 0n;
  let toppedUpMicro = 0n;
  let stakedMicro = 0n;
  let stakeWonMicro = 0n;
  for (const e of entries) {
    if (e.kind === "earn" || e.kind === "stake_win") earnedMicro += BigInt(e.amountMicro);
    else if (e.kind === "spend" || e.kind === "stake") spentMicro += BigInt(e.amountMicro);
    else toppedUpMicro += BigInt(e.amountMicro);
    if (e.kind === "stake") stakedMicro += BigInt(e.amountMicro);
    if (e.kind === "stake_win") stakeWonMicro += BigInt(e.amountMicro);
  }
  return {
    earnedUsdc: microToUsdc(earnedMicro.toString()),
    spentUsdc: microToUsdc(spentMicro.toString()),
    toppedUpUsdc: microToUsdc(toppedUpMicro.toString()),
    pnlUsdc: microToUsdc((earnedMicro - spentMicro).toString()),
    stakedUsdc: microToUsdc(stakedMicro.toString()),
    stakeWonUsdc: microToUsdc(stakeWonMicro.toString()),
    stakePnlUsdc: microToUsdc((stakeWonMicro - stakedMicro).toString()),
    entryCount: entries.length,
  };
}

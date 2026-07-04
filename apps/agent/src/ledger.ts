/**
 * STRIKER's book of record: every micro-payment in and out, with tx hashes.
 * In-memory for the dashboard + appended to .striker/ledger.jsonl for audit.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { microToUsdc } from "@striker/x402kit";

export interface LedgerEntry {
  ts: number;
  kind: "spend" | "earn" | "topup";
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

export function record(entry: LedgerEntry): void {
  entries.push(entry);
  try {
    appendFileSync(ledgerFile, `${JSON.stringify(entry)}\n`);
  } catch {
    /* dashboard still works off memory if the disk write fails */
  }
  const sign = entry.kind === "spend" ? "−" : "+";
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
  for (const e of entries) {
    if (e.kind === "earn") earnedMicro += BigInt(e.amountMicro);
    else if (e.kind === "spend") spentMicro += BigInt(e.amountMicro);
    else toppedUpMicro += BigInt(e.amountMicro);
  }
  return {
    earnedUsdc: microToUsdc(earnedMicro.toString()),
    spentUsdc: microToUsdc(spentMicro.toString()),
    toppedUpUsdc: microToUsdc(toppedUpMicro.toString()),
    pnlUsdc: microToUsdc((earnedMicro - spentMicro).toString()),
    entryCount: entries.length,
  };
}

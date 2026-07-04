import type { Address, Hex } from "viem";

export type PaywallMode = "live" | "sim";

/** One paid route: "METHOD /path" → price in USDC smallest units (6 decimals). */
export interface PaywallRouteConfig {
  description: string;
  /** USDC amount in smallest units, e.g. "20000" = 0.02 USDC */
  amount: string;
}

export interface SettlementRecord {
  direction: "earn" | "spend";
  /** USDC smallest units */
  amount: string;
  payer: Address;
  payTo: Address;
  resource: string;
  txHash: Hex;
  network: string;
  simulated: boolean;
  ts: number;
}

export interface PaywallOptions {
  mode: PaywallMode;
  network: "eip155:1776" | "eip155:1439";
  routes: Record<string, PaywallRouteConfig>;
  /** Facilitator/receiver private key. Required in live mode; optional in sim (ephemeral fallback). */
  privateKey?: Hex;
  /** Called after each successful settlement (live or sim) so the app can ledger earnings. */
  onSettle?: (record: SettlementRecord) => void;
}

export interface BuyerOptions {
  mode: PaywallMode;
  network: "eip155:1776" | "eip155:1439";
  /** Payer private key. Required in live mode; optional in sim (ephemeral fallback). */
  privateKey?: Hex;
}

export interface PaidReceipt {
  txHash: Hex;
  payer: Address;
  network: string;
  simulated: boolean;
}

export interface Buyer {
  address: Address;
  /** fetch that transparently completes the 402 → sign → retry cycle */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** receipt from the last successful paid response, if any */
  lastReceipt(res: Response): PaidReceipt | undefined;
}

export { makePaywall, walletAddress } from "./paywall.ts";
export { makeBuyer } from "./buyer.ts";
export type {
  Buyer,
  BuyerOptions,
  PaidReceipt,
  PaywallMode,
  PaywallOptions,
  PaywallRouteConfig,
  SettlementRecord,
} from "./types.ts";

export const MICRO = 1_000_000;
export const microToUsdc = (micro: string | number | bigint): number =>
  Number(micro) / MICRO;
export const usdcToMicro = (usdc: number): string =>
  String(Math.round(usdc * MICRO));

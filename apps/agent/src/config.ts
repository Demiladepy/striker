import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const mode: "live" | "sim" = process.env.STRIKER_MODE === "live" ? "live" : "sim";

export const CONFIG = {
  mode,
  network: "eip155:1439" as const,
  port: Number(process.env.AGENT_PORT ?? 4042),
  forgeUrl: `http://localhost:${process.env.FORGE_PORT ?? 4021}`,
  agentPrivateKey: (process.env.AGENT_PRIVATE_KEY || undefined) as Hex | undefined,
  anthropicKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.STRIKER_MODEL || "claude-haiku-4-5-20251001",
  prices: {
    /** GET /api/insight — STRIKER's freshest paid take */
    insight: "50000", // 0.05 USDC
  },
  /** Data Forge paid routes — must match apps/data-forge/src/config.ts */
  forgePrices: {
    deep: "20000", // 0.02 USDC
    signals: "10000", // 0.01 USDC
  },
  /** Cross-match signal sheet scout — cheaper than per-match /api/deep when 2+ live */
  signals: {
    enabled: process.env.SIGNALS_ENABLED !== "false",
    /** min live matches before buying the sheet */
    minLive: Number(process.env.SIGNALS_MIN_LIVE ?? 2),
    cooldownMs: Number(process.env.SIGNALS_COOLDOWN_MS ?? 120_000),
    /** only act on matches at or above this pressure index */
    pressureMin: Number(process.env.SIGNALS_PRESSURE_MIN ?? 55),
  },
  treasury: {
    reserveKey: (process.env.CCTP_RESERVE_PRIVATE_KEY || undefined) as Hex | undefined,
    sourceRpc: process.env.CCTP_SOURCE_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
    tokenMessenger: (process.env.CCTP_TOKEN_MESSENGER || "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA") as Hex,
    sourceUsdc: (process.env.CCTP_SOURCE_USDC || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as Hex,
    // Injective = CCTP domain 29 (Circle docs: cctp/concepts/supported-chains-and-domains)
    destDomain: process.env.CCTP_DEST_DOMAIN ? Number(process.env.CCTP_DEST_DOMAIN) : 29,
    floorUsdc: Number(process.env.TREASURY_FLOOR_USDC ?? 2),
    topupUsdc: Number(process.env.TREASURY_TOPUP_USDC ?? 5),
  },
  /** agent decision cadence */
  tickMs: 5_000,
  /** minimum gap between paid deep-data buys for the same match */
  buyCooldownMs: 55_000,
  /** sim-mode opening bankroll in USDC */
  simOpeningBankUsdc: 10,
  /** STRIKER stakes its own USDC on confident win-prob calls; settled at full time */
  staking: {
    enabled: process.env.STAKE_ENABLED !== "false",
    /** stake size per call, in USDC */
    stakeUsdc: Number(process.env.STAKE_USDC ?? 0.01),
    /** only stake when the favoured outcome clears this probability bar */
    minFavoredProb: Number(process.env.STAKE_MIN_PROB ?? 0.55),
  },
};

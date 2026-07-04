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
  treasury: {
    reserveKey: (process.env.CCTP_RESERVE_PRIVATE_KEY || undefined) as Hex | undefined,
    sourceRpc: process.env.CCTP_SOURCE_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
    tokenMessenger: (process.env.CCTP_TOKEN_MESSENGER || "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA") as Hex,
    sourceUsdc: (process.env.CCTP_SOURCE_USDC || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as Hex,
    destDomain: process.env.CCTP_DEST_DOMAIN ? Number(process.env.CCTP_DEST_DOMAIN) : undefined,
    floorUsdc: Number(process.env.TREASURY_FLOOR_USDC ?? 2),
    topupUsdc: Number(process.env.TREASURY_TOPUP_USDC ?? 5),
  },
  /** agent decision cadence */
  tickMs: 5_000,
  /** minimum gap between paid deep-data buys for the same match */
  buyCooldownMs: 55_000,
  /** sim-mode opening bankroll in USDC */
  simOpeningBankUsdc: 10,
};

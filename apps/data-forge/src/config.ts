import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const mode: "live" | "sim" = process.env.STRIKER_MODE === "live" ? "live" : "sim";

export const CONFIG = {
  mode,
  network: "eip155:1439" as const,
  port: Number(process.env.PORT ?? process.env.FORGE_PORT ?? 4021),
  privateKey: (process.env.FORGE_PRIVATE_KEY || undefined) as Hex | undefined,
  rpcUrl: process.env.INJECTIVE_RPC_URL || undefined,
  footballDataToken: process.env.FOOTBALL_DATA_TOKEN || undefined,
  replaySpeed: Math.max(1, Number(process.env.REPLAY_SPEED ?? 15)),
  prices: {
    /** GET /api/deep — full analytics for one match */
    deep: "20000", // 0.02 USDC
    /** GET /api/signals — cross-match betting-grade signals */
    signals: "10000", // 0.01 USDC
  },
};

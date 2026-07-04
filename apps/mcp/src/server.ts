/**
 * STRIKER MCP server — the agent economy as tools for any MCP client.
 *
 * Free tools read the public APIs; buy_insight and buy_deep_analytics complete
 * a real x402 payment cycle (EIP-3009 signature on Injective EVM) before
 * returning data, and report the settlement receipt alongside the payload.
 *
 * Pair with the official Injective MCP Server
 * (github.com/InjectiveLabs/mcp-server) for wallet funding and transfers.
 *
 * Connect from Claude Code / Desktop / Cursor:
 *   { "command": "npx", "args": ["tsx", "apps/mcp/src/server.ts"], "cwd": "<repo>" }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { makeBuyer, type PaidReceipt } from "@striker/x402kit";
import type { Hex } from "viem";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const AGENT = process.env.STRIKER_HOST ?? `http://localhost:${process.env.AGENT_PORT ?? 4042}`;
const FORGE = process.env.FORGE_HOST ?? `http://localhost:${process.env.FORGE_PORT ?? 4021}`;
const mode: "live" | "sim" = process.env.STRIKER_MODE === "live" ? "live" : "sim";

const buyer = makeBuyer({
  mode,
  network: "eip155:1439",
  privateKey: (process.env.STRIKER_PAYER_KEY || process.env.AGENT_PRIVATE_KEY || undefined) as
    | Hex
    | undefined,
});

function asText(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function freeGet(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function paidGet(url: string): Promise<{ receipt?: PaidReceipt; data: unknown }> {
  const res = await buyer.fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return { receipt: buyer.lastReceipt(res), data: await res.json() };
}

const server = new McpServer({ name: "striker", version: "0.1.0" });

server.tool(
  "get_scoreboard",
  "Free: live World Cup match board (fixtures, scores, minutes, live status) from the STRIKER Data Forge.",
  {},
  async () => asText(await freeGet(`${FORGE}/api/matches`)),
);

server.tool(
  "get_insight_teasers",
  "Free: headlines of STRIKER's latest insights — the shop window before paying for a full read.",
  {},
  async () => asText(await freeGet(`${AGENT}/api/insights/teasers`)),
);

server.tool(
  "get_track_record",
  "Free: STRIKER's self-graded forecasting record — accuracy, Brier scores, skill score, and stake P&L on its own win-probability calls.",
  {},
  async () => asText(await freeGet(`${AGENT}/api/track-record`)),
);

server.tool(
  "get_agent_state",
  "Free: STRIKER's condensed economic state — wallet balance, earnings vs spend, treasury status, recent settlements.",
  {},
  async () => {
    const s = (await freeGet(`${AGENT}/api/state`)) as Record<string, unknown>;
    return asText({
      agent: s.agent,
      balances: s.balances,
      book: s.book,
      treasury: s.treasury,
      prices: s.prices,
      recentLedger: (s.ledger as unknown[]).slice(0, 10),
    });
  },
);

server.tool(
  "buy_insight",
  "PAID (0.05 USDC via x402 on Injective EVM): buy STRIKER's freshest full insight — headline, analysis, momentum, win probabilities. Returns the settlement receipt (tx hash + payer) with the insight. Optionally target one match by id from get_scoreboard.",
  { match: z.string().optional().describe("match id from get_scoreboard (omit for the freshest insight)") },
  async ({ match }) => {
    const url = `${AGENT}/api/insight${match ? `?match=${encodeURIComponent(match)}` : ""}`;
    const { receipt, data } = await paidGet(url);
    return asText({ x402Settlement: receipt ?? "no receipt header returned", insight: data });
  },
);

server.tool(
  "buy_deep_analytics",
  "PAID (0.02 USDC via x402 on Injective EVM): buy raw deep analytics for one match straight from the Data Forge — momentum split, pressure index, live win probabilities, key moments. Returns the settlement receipt with the data.",
  { match: z.string().describe("match id from get_scoreboard") },
  async ({ match }) => {
    const { receipt, data } = await paidGet(`${FORGE}/api/deep?match=${encodeURIComponent(match)}`);
    return asText({ x402Settlement: receipt ?? "no receipt header returned", analytics: data });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[striker-mcp] ready (mode=${mode}, payer=${buyer.address}) — agent ${AGENT}, forge ${FORGE}`,
);

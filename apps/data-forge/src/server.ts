/**
 * DATA FORGE — the x402-gated World Cup data API.
 *
 * Free:  GET /health, GET /api/matches (scoreboard), GET /api/stats
 * Paid:  GET /api/deep?match=<id>   0.02 USDC — deep analytics for one match
 *        GET /api/signals           0.01 USDC — cross-match signal sheet
 *
 * Payments ride the x402 protocol on Injective EVM testnet (chain 1439).
 */
import express from "express";
import { makePaywall, microToUsdc, walletAddress, x402Cors, type SettlementRecord } from "@striker/x402kit";
import { CONFIG } from "./config.ts";
import { getMatch, getScoreboard } from "./data/provider.ts";
import { computeDeep } from "./enrich/analytics.ts";

const app = express();
app.use(x402Cors());
const bootedAt = new Date().toISOString();
const stats = { paidRequests: 0, revenueMicro: 0n, lastSettlements: [] as SettlementRecord[] };

app.use(
  makePaywall({
    mode: CONFIG.mode,
    network: CONFIG.network,
    privateKey: CONFIG.privateKey,
    rpcUrl: CONFIG.rpcUrl,
    routes: {
      "GET /api/deep": {
        description: "Deep live analytics for one World Cup match (momentum, pressure, win probability, key moments)",
        amount: CONFIG.prices.deep,
      },
      "GET /api/signals": {
        description: "Cross-match World Cup signal sheet — every live match, one paid call",
        amount: CONFIG.prices.signals,
      },
    },
    onSettle: (record) => {
      stats.paidRequests += 1;
      stats.revenueMicro += BigInt(record.amount);
      stats.lastSettlements = [record, ...stats.lastSettlements].slice(0, 20);
      console.log(
        `[forge] ${record.simulated ? "SIM" : "LIVE"} settlement ${microToUsdc(record.amount)} USDC from ${record.payer} → ${record.resource} (${record.txHash.slice(0, 18)}…)`,
      );
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "data-forge", mode: CONFIG.mode, network: CONFIG.network, bootedAt });
});

app.get("/api/matches", async (_req, res) => {
  const board = await getScoreboard();
  res.json({
    ...board,
    matches: board.matches.map(({ events, ...summary }) => ({
      ...summary,
      eventCount: events.length,
    })),
  });
});

app.get("/api/deep", async (req, res) => {
  const id = String(req.query.match ?? "");
  const match = await getMatch(id);
  if (!match) {
    res.status(404).json({ error: `unknown match id "${id}" — list ids via free GET /api/matches` });
    return;
  }
  res.json(computeDeep(match));
});

app.get("/api/signals", async (_req, res) => {
  const board = await getScoreboard();
  const live = board.matches.filter((m) => m.status === "LIVE");
  res.json({
    source: board.source,
    generatedAt: new Date().toISOString(),
    matches: live.map((m) => computeDeep(m)),
  });
});

app.get("/api/stats", (_req, res) => {
  res.json({
    paidRequests: stats.paidRequests,
    revenueUsdc: microToUsdc(stats.revenueMicro.toString()),
    recentSettlements: stats.lastSettlements,
    mode: CONFIG.mode,
  });
});

// Mutual keep-alive on free-tier hosting: the agent's scoreboard polls keep
// this service warm; pinging the agent back keeps IT warm. Neither spins down
// while the other breathes.
const agentUrl = process.env.AGENT_URL;
if (agentUrl) {
  setInterval(() => {
    fetch(`${agentUrl}/health`).catch(() => {});
  }, 8 * 60_000);
  console.log(`[forge] keep-alive pings → ${agentUrl}`);
}

app.listen(CONFIG.port, () => {
  const receiver = CONFIG.privateKey ? walletAddress(CONFIG.privateKey) : "(ephemeral sim wallet)";
  console.log(`⚒️  DATA FORGE on http://localhost:${CONFIG.port}  mode=${CONFIG.mode}  network=${CONFIG.network}`);
  console.log(`    receiver/facilitator: ${receiver}`);
  console.log(`    paid routes: /api/deep (0.02 USDC), /api/signals (0.01 USDC)`);
});

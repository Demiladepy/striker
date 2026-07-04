/**
 * STRIKER's storefront — the agent SELLS its analysis the same way it buys
 * data: over x402. Plus a free state API that powers the dashboard.
 *
 * Paid:  GET /api/insight            0.05 USDC — freshest full insight
 * Free:  GET /api/insights/teasers   headlines only (the shop window)
 *        GET /api/state              dashboard feed (balances, ledger, board)
 *        GET /health
 */
import express from "express";
import { makePaywall, microToUsdc, type SettlementRecord } from "@striker/x402kit";
import { CONFIG } from "./config.ts";
import { record, recent, totals } from "./ledger.ts";
import { getBalances, account, privateKey } from "./wallet.ts";
import { treasuryState } from "./treasury.ts";
import { buyerAddress, getBoard, getInsights, getLoopError } from "./loop.ts";

export function startStorefront(): void {
  const app = express();

  app.use(
    makePaywall({
      mode: CONFIG.mode,
      network: CONFIG.network,
      privateKey,
      routes: {
        "GET /api/insight": {
          description: "STRIKER's freshest World Cup insight — momentum, win probability, and a broadcast-grade read",
          amount: CONFIG.prices.insight,
        },
      },
      onSettle: (settlement: SettlementRecord) => {
        record({
          ts: settlement.ts,
          kind: "earn",
          amountMicro: settlement.amount,
          counterparty: settlement.payer,
          purpose: "insight sold via x402 storefront",
          txHash: settlement.txHash,
          network: settlement.network,
          simulated: settlement.simulated,
        });
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "striker-agent", mode: CONFIG.mode, address: account.address });
  });

  app.get("/api/insight", (req, res) => {
    const matchId = req.query.match ? String(req.query.match) : undefined;
    const pool = getInsights(100);
    const insight = matchId ? pool.find((i) => i.matchId === matchId) : pool[0];
    if (!insight) {
      res.status(404).json({ error: "no insights yet — STRIKER is still warming up" });
      return;
    }
    res.json(insight);
  });

  app.get("/api/insights/teasers", (_req, res) => {
    res.json(
      getInsights(20).map(({ id, fixture, minute, score, headline, confidence, ts }) => ({
        id,
        fixture,
        minute,
        score,
        headline,
        confidence,
        ts,
        fullInsight: `x402-gated at GET /api/insight — ${microToUsdc(CONFIG.prices.insight)} USDC`,
      })),
    );
  });

  app.get("/api/state", async (_req, res) => {
    res.json({
      agent: {
        name: "STRIKER",
        address: account.address,
        buyerAddress: buyerAddress(),
        mode: CONFIG.mode,
        network: CONFIG.network,
        loopError: getLoopError() ?? null,
      },
      balances: await getBalances(),
      book: totals(),
      treasury: treasuryState(),
      ledger: recent(60),
      insights: getInsights(20),
      board: getBoard() ?? null,
      prices: { insightUsdc: microToUsdc(CONFIG.prices.insight) },
    });
  });

  app.listen(CONFIG.port, () => {
    console.log(`⚡ STRIKER storefront on http://localhost:${CONFIG.port}  mode=${CONFIG.mode}`);
    console.log(`    wallet: ${account.address}`);
    console.log(`    selling: GET /api/insight (${microToUsdc(CONFIG.prices.insight)} USDC via x402)`);
  });
}

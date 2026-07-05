/**
 * The decision loop — STRIKER watches the free scoreboard and decides when a
 * moment is worth paying for.
 *
 * Two paid data strategies:
 *   /api/deep  (0.02) — single-match deep read on goals, endgame, or solo live games
 *   /api/signals (0.01) — cross-match scout when 2+ games are live; publishes
 *                         from the hottest match in the sheet (no second deep buy)
 */
import { makeBuyer, microToUsdc, type PaidReceipt } from "@striker/x402kit";
import { CONFIG } from "./config.ts";
import { generateInsight, type DeepPayload, type Insight } from "./brain.ts";
import { record } from "./ledger.ts";
import { privateKey } from "./wallet.ts";
import { checkTreasury } from "./treasury.ts";
import { getBalances } from "./wallet.ts";
import { gradeBoard, registerCall } from "./predictions.ts";

interface MatchSummary {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: "SCHEDULED" | "LIVE" | "FT";
  stage: string;
}

interface ScoreboardResponse {
  source: "live" | "replay";
  competition: string;
  matches: MatchSummary[];
}

export interface SignalsSnapshot {
  source: "live" | "replay";
  generatedAt: string;
  matches: Array<{
    matchId: string;
    fixture: string;
    minute: number;
    score: string;
    pressureIndex: number;
    momentum: { home: number; away: number };
    winProb: { home: number; draw: number; away: number };
  }>;
}

const buyer = makeBuyer({ mode: CONFIG.mode, network: CONFIG.network, privateKey, rpcUrl: CONFIG.rpcUrl });

const insights: Insight[] = [];
const lastBuyAt = new Map<string, number>();
const lastScore = new Map<string, string>();
let latestBoard: ScoreboardResponse | undefined;
let latestSignals: SignalsSnapshot | undefined;
let lastSignalsBuyAt = 0;
let loopError: string | undefined;

export function getInsights(limit = 50): Insight[] {
  return insights.slice(-limit).reverse();
}
export function getBoard(): ScoreboardResponse | undefined {
  return latestBoard;
}
export function getSignals(): SignalsSnapshot | undefined {
  return latestSignals;
}
export function getLoopError(): string | undefined {
  return loopError;
}
export function buyerAddress(): string {
  return buyer.address;
}

function shouldBuyDeep(match: MatchSummary, now: number, liveCount: number): string | undefined {
  if (match.status !== "LIVE") return undefined;
  const last = lastBuyAt.get(match.id) ?? 0;
  if (now - last < CONFIG.buyCooldownMs) return undefined;

  const score = `${match.homeScore}-${match.awayScore}`;
  const previous = lastScore.get(match.id);
  if (previous !== undefined && previous !== score) return `GOAL — score moved ${previous} → ${score}`;
  if (match.minute >= 80) return `endgame — ${match.minute}' with the match in the balance`;
  // solo live game: no signal sheet economics — fall back to scheduled deep refresh
  if (liveCount === 1 && now - last > CONFIG.buyCooldownMs * 2) {
    return "scheduled refresh of the live read";
  }
  return undefined;
}

async function publishInsight(
  deep: DeepPayload,
  reason: string,
  source: "deep" | "signals",
  costMicro: string,
  receipt: PaidReceipt | undefined,
): Promise<void> {
  record({
    ts: Date.now(),
    kind: "spend",
    amountMicro: costMicro,
    counterparty: "data-forge",
    purpose:
      source === "signals"
        ? `signal sheet · ${deep.fixture} @ ${deep.minute}' (${reason})`
        : `deep analytics · ${deep.fixture} @ ${deep.minute}' (${reason})`,
    txHash: receipt?.txHash ?? "0x",
    network: receipt?.network ?? CONFIG.network,
    simulated: receipt?.simulated ?? true,
  });

  const insight = await generateInsight(deep, {
    costMicro,
    dataTxHash: receipt?.txHash ?? "0x",
    simulated: receipt?.simulated ?? true,
    dataSource: source,
  });
  insights.push(insight);
  if (insights.length > 500) insights.splice(0, insights.length - 500);
  registerCall(deep, insight);
  const tag = source === "signals" ? "📡" : "🧠";
  console.log(
    `[striker] ${tag} ${insight.fixture} ${insight.minute}' — "${insight.headline}" (paid ${microToUsdc(costMicro)} USDC via ${source}, ${insight.engine})`,
  );
}

async function buyDeep(match: MatchSummary, reason: string, now: number): Promise<void> {
  const url = `${CONFIG.forgeUrl}/api/deep?match=${encodeURIComponent(match.id)}`;
  const res = await buyer.fetch(url);
  if (!res.ok) {
    console.error(`[striker] deep buy failed ${res.status} for ${match.id}`);
    return;
  }
  lastBuyAt.set(match.id, now);
  const receipt = buyer.lastReceipt(res);
  const deep = (await res.json()) as DeepPayload;
  await publishInsight(deep, reason, "deep", CONFIG.forgePrices.deep, receipt);
}

async function scoutWithSignals(live: MatchSummary[], now: number): Promise<void> {
  const { signals } = CONFIG;
  if (!signals.enabled || live.length < signals.minLive) return;
  if (now - lastSignalsBuyAt < signals.cooldownMs) return;

  const res = await buyer.fetch(`${CONFIG.forgeUrl}/api/signals`);
  if (!res.ok) {
    console.error(`[striker] signals buy failed ${res.status}`);
    return;
  }
  const receipt = buyer.lastReceipt(res);
  const body = (await res.json()) as { source: "live" | "replay"; generatedAt: string; matches: DeepPayload[] };
  lastSignalsBuyAt = now;

  latestSignals = {
    source: body.source,
    generatedAt: body.generatedAt,
    matches: body.matches.map((m) => ({
      matchId: m.matchId,
      fixture: m.fixture,
      minute: m.minute,
      score: m.score,
      pressureIndex: m.pressureIndex,
      momentum: m.momentum,
      winProb: m.winProb,
    })),
  };

  const hot = body.matches
    .filter((m) => m.pressureIndex >= signals.pressureMin)
    .sort((a, b) => b.pressureIndex - a.pressureIndex);

  if (hot.length === 0) {
    console.log(`[striker] 📡 signal sheet bought — no match above pressure ${signals.pressureMin}`);
    record({
      ts: Date.now(),
      kind: "spend",
      amountMicro: CONFIG.forgePrices.signals,
      counterparty: "data-forge",
      purpose: `signal sheet · ${body.matches.length} live matches scanned (none hot enough)`,
      txHash: receipt?.txHash ?? "0x",
      network: receipt?.network ?? CONFIG.network,
      simulated: receipt?.simulated ?? true,
    });
    return;
  }

  const deep = hot[0]!;
  const last = lastBuyAt.get(deep.matchId) ?? 0;
  if (now - last < CONFIG.buyCooldownMs) {
    record({
      ts: Date.now(),
      kind: "spend",
      amountMicro: CONFIG.forgePrices.signals,
      counterparty: "data-forge",
      purpose: `signal sheet · ${body.matches.length} live — hottest ${deep.fixture} on cooldown`,
      txHash: receipt?.txHash ?? "0x",
      network: receipt?.network ?? CONFIG.network,
      simulated: receipt?.simulated ?? true,
    });
    return;
  }

  lastBuyAt.set(deep.matchId, now);
  await publishInsight(
    deep,
    `pressure ${deep.pressureIndex}/100 — cross-match scout`,
    "signals",
    CONFIG.forgePrices.signals,
    receipt,
  );
}

async function tick(): Promise<void> {
  const now = Date.now();
  const res = await fetch(`${CONFIG.forgeUrl}/api/matches`);
  if (!res.ok) throw new Error(`forge scoreboard ${res.status}`);
  latestBoard = (await res.json()) as ScoreboardResponse;

  const live = latestBoard.matches.filter((m) => m.status === "LIVE");

  for (const match of latestBoard.matches) {
    const reason = shouldBuyDeep(match, now, live.length);
    if (reason) await buyDeep(match, reason, now);
    lastScore.set(match.id, `${match.homeScore}-${match.awayScore}`);
  }

  await scoutWithSignals(live, now);
  gradeBoard(latestBoard.matches);
  await checkTreasury(await getBalances());
}

export function startLoop(): void {
  console.log(
    `[striker] decision loop armed — watching ${CONFIG.forgeUrl} every ${CONFIG.tickMs / 1000}s` +
      (CONFIG.signals.enabled ? ` · signal scout when ${CONFIG.signals.minLive}+ live` : ""),
  );
  const run = async () => {
    try {
      await tick();
      loopError = undefined;
    } catch (err) {
      loopError = err instanceof Error ? err.message : String(err);
      console.error(`[striker] tick failed: ${loopError}`);
    } finally {
      setTimeout(run, CONFIG.tickMs);
    }
  };
  void run();
}

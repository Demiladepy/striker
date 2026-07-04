/**
 * The decision loop — STRIKER watches the free scoreboard and decides when a
 * moment is worth paying for. Goals, late-game pressure, and staleness all
 * trigger a paid x402 buy of deep analytics, which the brain turns into a
 * sellable insight.
 */
import { makeBuyer, microToUsdc } from "@striker/x402kit";
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

const buyer = makeBuyer({ mode: CONFIG.mode, network: CONFIG.network, privateKey });

const insights: Insight[] = [];
const lastBuyAt = new Map<string, number>();
const lastScore = new Map<string, string>();
let latestBoard: ScoreboardResponse | undefined;
let loopError: string | undefined;

export function getInsights(limit = 50): Insight[] {
  return insights.slice(-limit).reverse();
}
export function getBoard(): ScoreboardResponse | undefined {
  return latestBoard;
}
export function getLoopError(): string | undefined {
  return loopError;
}
export function buyerAddress(): string {
  return buyer.address;
}

function shouldBuy(match: MatchSummary, now: number): string | undefined {
  if (match.status !== "LIVE") return undefined;
  const last = lastBuyAt.get(match.id) ?? 0;
  if (now - last < CONFIG.buyCooldownMs) return undefined;

  const score = `${match.homeScore}-${match.awayScore}`;
  const previous = lastScore.get(match.id);
  if (previous !== undefined && previous !== score) return `GOAL — score moved ${previous} → ${score}`;
  if (match.minute >= 80) return `endgame — ${match.minute}' with the match in the balance`;
  if (now - last > CONFIG.buyCooldownMs * 2) return "scheduled refresh of the live read";
  return undefined;
}

async function buyDeep(match: MatchSummary, reason: string): Promise<void> {
  const url = `${CONFIG.forgeUrl}/api/deep?match=${encodeURIComponent(match.id)}`;
  const res = await buyer.fetch(url);
  if (!res.ok) {
    console.error(`[striker] deep buy failed ${res.status} for ${match.id}`);
    return;
  }
  const receipt = buyer.lastReceipt(res);
  const deep = (await res.json()) as DeepPayload;
  const cost = "20000"; // matches forge pricing for /api/deep

  record({
    ts: Date.now(),
    kind: "spend",
    amountMicro: cost,
    counterparty: "data-forge",
    purpose: `deep analytics · ${deep.fixture} @ ${deep.minute}' (${reason})`,
    txHash: receipt?.txHash ?? "0x",
    network: receipt?.network ?? CONFIG.network,
    simulated: receipt?.simulated ?? true,
  });

  const insight = await generateInsight(deep, {
    costMicro: cost,
    dataTxHash: receipt?.txHash ?? "0x",
    simulated: receipt?.simulated ?? true,
  });
  insights.push(insight);
  if (insights.length > 500) insights.splice(0, insights.length - 500);
  registerCall(deep, insight);
  console.log(
    `[striker] 🧠 ${insight.fixture} ${insight.minute}' — "${insight.headline}" (paid ${microToUsdc(cost)} USDC, ${insight.engine})`,
  );
}

async function tick(): Promise<void> {
  const now = Date.now();
  const res = await fetch(`${CONFIG.forgeUrl}/api/matches`);
  if (!res.ok) throw new Error(`forge scoreboard ${res.status}`);
  latestBoard = (await res.json()) as ScoreboardResponse;

  for (const match of latestBoard.matches) {
    const reason = shouldBuy(match, now);
    if (reason) {
      lastBuyAt.set(match.id, now);
      await buyDeep(match, reason);
    }
    lastScore.set(match.id, `${match.homeScore}-${match.awayScore}`);
  }

  gradeBoard(latestBoard.matches);
  await checkTreasury(await getBalances());
}

export function startLoop(): void {
  console.log(`[striker] decision loop armed — watching ${CONFIG.forgeUrl} every ${CONFIG.tickMs / 1000}s`);
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

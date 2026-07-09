/**
 * STRIKER's track record — the agent grades its own win-probability calls and
 * stakes its own USDC on the ones it trusts.
 *
 * Every paid insight carries a live win-probability distribution. We snapshot
 * that as a "call"; when confident enough, STRIKER locks a stake at fair odds
 * derived from its own model (payout = stake / favoredProb). At full time the
 * call is Brier-graded and the stake settles — win or loss hits the ledger.
 */
import { randomBytes } from "node:crypto";
import { microToUsdc, usdcToMicro } from "@striker/x402kit";
import { loadSnapshot, saveSnapshot } from "./persist.ts";
import type { DeepPayload, Insight } from "./brain.ts";
import { CONFIG } from "./config.ts";
import { record } from "./ledger.ts";

export type Outcome = "home" | "draw" | "away";

export interface Call {
  id: string;
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  winProb: { home: number; draw: number; away: number };
  favored: Outcome;
  favoredProb: number;
  confidence: number;
  ts: number;
  simulated: boolean;
  graded: boolean;
  result?: Outcome;
  finalScore?: string;
  correct?: boolean;
  /** Brier score for this call, 0 (perfect) … 2 (worst) for a 3-way market */
  brier?: number;
  /** stake locked on this call, in USDC micro-units */
  stakeMicro?: string;
  stakeSettled?: boolean;
  /** total return on a winning stake (includes original stake) */
  payoutMicro?: string;
  /** net stake P&L in micro-units once settled */
  stakePnlMicro?: string;
}

export interface StakesSummary {
  enabled: boolean;
  stakeUsdc: number;
  minFavoredProb: number;
  placed: number;
  settled: number;
  won: number;
  lost: number;
  open: number;
  openStakeUsdc: number;
  stakedUsdc: number;
  wonUsdc: number;
  pnlUsdc: number;
}

export interface TrackRecord {
  calls: number;
  graded: number;
  open: number;
  correct: number;
  accuracy: number;
  meanBrier: number | null;
  skillScore: number | null;
  stakes: StakesSummary;
  recent: Call[];
}

const UNINFORMED_BRIER = 2 * (1 / 3) ** 2 + (2 / 3) ** 2;

const calls: Call[] = loadSnapshot<Call[]>("calls", []);
if (calls.length > 0) console.log(`[predictions] reloaded ${calls.length} calls from disk`);

function favoredOutcome(p: { home: number; draw: number; away: number }): Outcome {
  if (p.home >= p.draw && p.home >= p.away) return "home";
  if (p.away >= p.home && p.away >= p.draw) return "away";
  return "draw";
}

function simTxHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

function maybeStake(call: Call, favored: Outcome, deep: DeepPayload, insight: Insight): void {
  const { staking } = CONFIG;
  if (!staking.enabled || deep.winProb[favored] < staking.minFavoredProb) return;

  const stakeMicro = usdcToMicro(staking.stakeUsdc);
  call.stakeMicro = stakeMicro;
  record({
    ts: insight.ts,
    kind: "stake",
    amountMicro: stakeMicro,
    counterparty: "prediction-market",
    purpose: `stake ${microToUsdc(stakeMicro)} USDC on ${favored} @ ${(deep.winProb[favored] * 100).toFixed(0)}% · ${deep.fixture}`,
    txHash: simTxHash(),
    network: CONFIG.network,
    // stakes settle against STRIKER's own model, not an on-chain market (yet) —
    // always simulated so the dashboard never links a fabricated tx hash
    simulated: true,
  });
}

function settleStake(call: Call): void {
  if (!call.stakeMicro || call.stakeSettled) return;
  call.stakeSettled = true;

  if (call.correct) {
    const payoutMicro = String(Math.round(Number(call.stakeMicro) / call.favoredProb));
    call.payoutMicro = payoutMicro;
    call.stakePnlMicro = String(Number(payoutMicro) - Number(call.stakeMicro));
    record({
      ts: Date.now(),
      kind: "stake_win",
      amountMicro: payoutMicro,
      counterparty: "prediction-market",
      purpose: `stake won · ${call.fixture} · ${microToUsdc(call.stakeMicro)} → ${microToUsdc(payoutMicro)} USDC`,
      txHash: simTxHash(),
      network: CONFIG.network,
      simulated: true,
    });
  } else {
    call.stakePnlMicro = `-${call.stakeMicro}`;
  }
}

export function registerCall(deep: DeepPayload, insight: Insight): void {
  const favored = favoredOutcome(deep.winProb);
  const call: Call = {
    id: `${insight.id}-call`,
    matchId: deep.matchId,
    fixture: deep.fixture,
    minute: deep.minute,
    score: deep.score,
    winProb: deep.winProb,
    favored,
    favoredProb: Number(deep.winProb[favored].toFixed(3)),
    confidence: insight.confidence,
    ts: insight.ts,
    simulated: insight.simulated,
    graded: false,
  };
  maybeStake(call, favored, deep, insight);
  calls.push(call);
  if (calls.length > 1000) calls.splice(0, calls.length - 1000);
  saveSnapshot("calls", calls);
}

interface FinishableMatch {
  id: string;
  status: "SCHEDULED" | "LIVE" | "FT";
  homeScore: number;
  awayScore: number;
}

function brierScore(p: { home: number; draw: number; away: number }, result: Outcome): number {
  const oneHot = {
    home: result === "home" ? 1 : 0,
    draw: result === "draw" ? 1 : 0,
    away: result === "away" ? 1 : 0,
  };
  return (p.home - oneHot.home) ** 2 + (p.draw - oneHot.draw) ** 2 + (p.away - oneHot.away) ** 2;
}

export function gradeBoard(matches: FinishableMatch[]): void {
  const finished = new Map<string, { result: Outcome; finalScore: string }>();
  for (const m of matches) {
    if (m.status !== "FT") continue;
    const result: Outcome =
      m.homeScore > m.awayScore ? "home" : m.awayScore > m.homeScore ? "away" : "draw";
    finished.set(m.id, { result, finalScore: `${m.homeScore}-${m.awayScore}` });
  }
  let changed = false;
  for (const call of calls) {
    if (call.graded) continue;
    const fin = finished.get(call.matchId);
    if (!fin) continue;
    call.graded = true;
    call.result = fin.result;
    call.finalScore = fin.finalScore;
    call.correct = call.favored === fin.result;
    call.brier = Number(brierScore(call.winProb, fin.result).toFixed(4));
    settleStake(call);
    changed = true;
  }
  if (changed) saveSnapshot("calls", calls);
}

function stakesSummary(): StakesSummary {
  const staked = calls.filter((c) => c.stakeMicro);
  const settled = staked.filter((c) => c.stakeSettled);
  const won = settled.filter((c) => c.correct);
  const lost = settled.filter((c) => !c.correct);
  const open = staked.filter((c) => !c.stakeSettled);
  const stakedMicro = staked.reduce((s, c) => s + BigInt(c.stakeMicro!), 0n);
  const wonMicro = won.reduce((s, c) => s + BigInt(c.payoutMicro ?? "0"), 0n);
  const openMicro = open.reduce((s, c) => s + BigInt(c.stakeMicro!), 0n);
  return {
    enabled: CONFIG.staking.enabled,
    stakeUsdc: CONFIG.staking.stakeUsdc,
    minFavoredProb: CONFIG.staking.minFavoredProb,
    placed: staked.length,
    settled: settled.length,
    won: won.length,
    lost: lost.length,
    open: open.length,
    openStakeUsdc: microToUsdc(openMicro.toString()),
    stakedUsdc: microToUsdc(stakedMicro.toString()),
    wonUsdc: microToUsdc(wonMicro.toString()),
    pnlUsdc: microToUsdc((wonMicro - stakedMicro).toString()),
  };
}

export function trackRecord(): TrackRecord {
  const graded = calls.filter((c) => c.graded);
  const correct = graded.filter((c) => c.correct).length;
  const meanBrier = graded.length
    ? Number((graded.reduce((s, c) => s + (c.brier ?? 0), 0) / graded.length).toFixed(4))
    : null;
  const skillScore =
    meanBrier === null ? null : Number((1 - meanBrier / UNINFORMED_BRIER).toFixed(3));
  return {
    calls: calls.length,
    graded: graded.length,
    open: calls.length - graded.length,
    correct,
    accuracy: graded.length ? Number((correct / graded.length).toFixed(3)) : 0,
    meanBrier,
    skillScore,
    stakes: stakesSummary(),
    recent: [...graded].sort((a, b) => b.ts - a.ts).slice(0, 12),
  };
}

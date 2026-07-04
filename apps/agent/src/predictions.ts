/**
 * STRIKER's track record — the agent grades its own win-probability calls.
 *
 * Every paid insight carries a live win-probability distribution. We snapshot
 * that distribution as a "call"; when the match reaches full time we score it
 * with the Brier score (a proper scoring rule) and mark whether the favoured
 * outcome came in. STRIKER is therefore accountable: its accuracy and
 * calibration are measurable on-screen, not just vibes.
 */
import type { DeepPayload, Insight } from "./brain.ts";

export type Outcome = "home" | "draw" | "away";

export interface Call {
  id: string;
  matchId: string;
  fixture: string;
  /** minute the call was made */
  minute: number;
  /** score at the time of the call */
  score: string;
  winProb: { home: number; draw: number; away: number };
  favored: Outcome;
  favoredProb: number;
  confidence: number;
  ts: number;
  graded: boolean;
  result?: Outcome;
  finalScore?: string;
  correct?: boolean;
  /** Brier score for this call, 0 (perfect) … 2 (worst) for a 3-way market */
  brier?: number;
}

export interface TrackRecord {
  calls: number;
  graded: number;
  /** calls still waiting on a full-time whistle */
  open: number;
  correct: number;
  /** correct / graded, 0..1 */
  accuracy: number;
  /** mean Brier over graded calls; lower is better */
  meanBrier: number | null;
  /** Brier skill score vs an uninformed (1/3,1/3,1/3) forecast; higher is better */
  skillScore: number | null;
  recent: Call[];
}

/**
 * Brier of a flat (1/3,1/3,1/3) forecast against any one-hot result:
 * two misses at (1/3)^2 plus one hit at (2/3)^2 = 0.6667. Anything below this
 * means STRIKER's probabilities carry real skill.
 */
const UNINFORMED_BRIER = 2 * (1 / 3) ** 2 + (2 / 3) ** 2;

const calls: Call[] = [];

function favoredOutcome(p: { home: number; draw: number; away: number }): Outcome {
  if (p.home >= p.draw && p.home >= p.away) return "home";
  if (p.away >= p.home && p.away >= p.draw) return "away";
  return "draw";
}

export function registerCall(deep: DeepPayload, insight: Insight): void {
  const favored = favoredOutcome(deep.winProb);
  calls.push({
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
    graded: false,
  });
  if (calls.length > 1000) calls.splice(0, calls.length - 1000);
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

/** Grade every open call whose match has just reached full time. */
export function gradeBoard(matches: FinishableMatch[]): void {
  const finished = new Map<string, { result: Outcome; finalScore: string }>();
  for (const m of matches) {
    if (m.status !== "FT") continue;
    const result: Outcome =
      m.homeScore > m.awayScore ? "home" : m.awayScore > m.homeScore ? "away" : "draw";
    finished.set(m.id, { result, finalScore: `${m.homeScore}-${m.awayScore}` });
  }
  for (const call of calls) {
    if (call.graded) continue;
    const fin = finished.get(call.matchId);
    if (!fin) continue;
    call.graded = true;
    call.result = fin.result;
    call.finalScore = fin.finalScore;
    call.correct = call.favored === fin.result;
    call.brier = Number(brierScore(call.winProb, fin.result).toFixed(4));
  }
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
    recent: [...graded].sort((a, b) => b.ts - a.ts).slice(0, 12),
  };
}

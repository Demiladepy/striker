/**
 * The paid product: deep match analytics computed from the event stream.
 * Momentum, pressure, live win probabilities, and narrative-grade signals.
 */
import type { MatchState, Side } from "../data/types.ts";

export interface DeepAnalytics {
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  momentum: { home: number; away: number }; // 0..100
  pressureIndex: number; // 0..100, how hot the game is right now
  winProb: { home: number; draw: number; away: number }; // sums to 1
  xThreat: { home: number; away: number }; // cumulative chance quality proxy
  keyMoments: Array<{ minute: number; detail: string }>;
  signals: string[];
  generatedAt: string;
}

const WINDOW = 15; // minutes of recent play that define momentum

function eventWeight(type: string): number {
  switch (type) {
    case "GOAL": return 3;
    case "CHANCE": return 1;
    case "RED": return -2;
    case "YELLOW": return -0.25;
    default: return 0;
  }
}

function recentWeight(match: MatchState, side: Side): number {
  return match.events
    .filter((e) => e.team === side && e.minute > match.minute - WINDOW)
    .reduce((sum, e) => sum + Math.max(0, eventWeight(e.type)), 0);
}

export function computeDeep(match: MatchState): DeepAnalytics {
  const homeRecent = recentWeight(match, "home");
  const awayRecent = recentWeight(match, "away");
  const total = homeRecent + awayRecent;

  const homeMomentum = total === 0 ? 50 : Math.round((homeRecent / total) * 100);
  const pressure = Math.min(100, Math.round(total * 14 + (match.minute > 75 ? 20 : 0)));

  const xThreat = (side: Side) =>
    Number(
      match.events
        .filter((e) => e.team === side)
        .reduce((sum, e) => sum + (e.type === "GOAL" ? 0.35 : e.type === "CHANCE" ? 0.11 : 0), 0)
        .toFixed(2),
    );

  // Live win probability: score difference dominates, time remaining decays the
  // draw path, momentum nudges the balance. Deliberately simple + explainable.
  const diff = match.homeScore - match.awayScore;
  const minutesLeft = Math.max(0, 90 - match.minute);
  const momentumTilt = (homeMomentum - 50) / 250; // ±0.2 max
  let home = 1 / (1 + Math.exp(-(diff * 0.9 + momentumTilt * (minutesLeft / 90) * 2)));
  let draw = 0.28 * (diff === 0 ? 1.4 : 0.55) * (minutesLeft / 90 + 0.15);
  draw = Math.min(draw, 0.45);
  home = home * (1 - draw);
  const away = Math.max(0, 1 - home - draw);

  const keyMoments = match.events
    .filter((e) => e.type === "GOAL" || e.type === "RED")
    .map((e) => ({ minute: e.minute, detail: e.detail }));

  const leader = homeMomentum >= 50 ? match.home : match.away;
  const signals = [
    `${leader} own ${Math.max(homeMomentum, 100 - homeMomentum)}% of the momentum over the last ${WINDOW}'`,
    `Pressure index ${pressure}/100 at ${match.minute}' — ${pressure > 65 ? "next goal window is OPEN" : "game state is controlled"}`,
    `Live win prob — ${match.home} ${(home * 100).toFixed(0)}% / draw ${(draw * 100).toFixed(0)}% / ${match.away} ${(away * 100).toFixed(0)}%`,
  ];
  if (match.events.length === 0) {
    signals.push("Event stream unavailable for this feed — probabilities derived from score + clock only");
  }

  return {
    matchId: match.id,
    fixture: `${match.home} vs ${match.away}`,
    minute: match.minute,
    score: `${match.homeScore}-${match.awayScore}`,
    momentum: { home: homeMomentum, away: 100 - homeMomentum },
    pressureIndex: pressure,
    winProb: {
      home: Number(home.toFixed(3)),
      draw: Number(draw.toFixed(3)),
      away: Number(away.toFixed(3)),
    },
    xThreat: { home: xThreat("home"), away: xThreat("away") },
    keyMoments,
    signals,
    generatedAt: new Date().toISOString(),
  };
}

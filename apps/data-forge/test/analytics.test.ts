import { describe, expect, it } from "vitest";
import { computeDeep } from "../src/enrich/analytics.ts";
import type { MatchState } from "../src/data/types.ts";

function match(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: "test-1",
    stage: "Quarter-final",
    home: "France",
    away: "Brazil",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "LIVE",
    kickoff: new Date().toISOString(),
    events: [],
    ...overrides,
  };
}

describe("deep analytics invariants", () => {
  it("win probabilities are a valid distribution", () => {
    const deep = computeDeep(match());
    const sum = deep.winProb.home + deep.winProb.draw + deep.winProb.away;
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
    for (const p of Object.values(deep.winProb)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("momentum halves always sum to 100", () => {
    const deep = computeDeep(
      match({
        events: [
          { minute: 40, type: "CHANCE", team: "home", detail: "shot" },
          { minute: 42, type: "GOAL", team: "home", detail: "goal" },
        ],
        homeScore: 1,
      }),
    );
    expect(deep.momentum.home + deep.momentum.away).toBe(100);
    expect(deep.momentum.home).toBeGreaterThan(50);
  });

  it("a lead shifts win probability toward the leader", () => {
    const level = computeDeep(match());
    const leading = computeDeep(match({ homeScore: 2, awayScore: 0 }));
    expect(leading.winProb.home).toBeGreaterThan(level.winProb.home);
    expect(leading.winProb.away).toBeLessThan(level.winProb.away);
  });

  it("late minutes shrink the draw path when scores differ", () => {
    const early = computeDeep(match({ homeScore: 1, awayScore: 0, minute: 20 }));
    const late = computeDeep(match({ homeScore: 1, awayScore: 0, minute: 88 }));
    expect(late.winProb.draw).toBeLessThan(early.winProb.draw);
  });

  it("degrades gracefully with no event stream (live-feed mode)", () => {
    const deep = computeDeep(match({ events: [], homeScore: 1, awayScore: 1, minute: 70 }));
    expect(deep.momentum.home).toBe(50);
    expect(deep.signals.some((s) => s.includes("Event stream unavailable"))).toBe(true);
  });
});

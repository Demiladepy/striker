/**
 * REPLAY engine — a realistic simulated 2026 knockout slate that progresses in
 * real time, so STRIKER always has live football to analyze even without a
 * football-data.org token. Clearly labeled `source: "replay"` everywhere.
 *
 * Matches kick off staggered, play a full 90' compressed by REPLAY_SPEED,
 * then the slate re-seeds and runs again — an endless demo reel.
 */
import { CONFIG } from "../config.ts";
import type { MatchEvent, MatchState, Side } from "./types.ts";

interface TeamProfile {
  name: string;
  attack: number; // 0..1 chance-creation strength
  defense: number; // 0..1 chance-suppression strength
}

const TEAMS: Record<string, TeamProfile> = {
  France: { name: "France", attack: 0.86, defense: 0.82 },
  Brazil: { name: "Brazil", attack: 0.88, defense: 0.76 },
  England: { name: "England", attack: 0.8, defense: 0.84 },
  Spain: { name: "Spain", attack: 0.85, defense: 0.8 },
  Argentina: { name: "Argentina", attack: 0.87, defense: 0.81 },
  Portugal: { name: "Portugal", attack: 0.82, defense: 0.78 },
  Germany: { name: "Germany", attack: 0.79, defense: 0.77 },
  Morocco: { name: "Morocco", attack: 0.72, defense: 0.85 },
};

const SLATE: Array<{ id: string; home: string; away: string; stage: string }> = [
  { id: "qf1", home: "France", away: "Brazil", stage: "Quarter-final" },
  { id: "qf2", home: "England", away: "Spain", stage: "Quarter-final" },
  { id: "qf3", home: "Argentina", away: "Portugal", stage: "Quarter-final" },
  { id: "qf4", home: "Germany", away: "Morocco", stage: "Quarter-final" },
];

/** Deterministic PRNG so a given (match, cycle) always replays identically. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CHANCE_LINES = [
  "curls one just wide of the far post",
  "forces a fingertip save from range",
  "heads over from the corner",
  "breaks in behind but the keeper stands tall",
  "rattles the crossbar with a half-volley",
  "sees a low drive blocked at the near post",
];
const GOAL_LINES = [
  "finishes low into the corner — GOAL!",
  "buries the rebound — GOAL!",
  "thumps a header home from the cross — GOAL!",
  "converts the counter with ice in the veins — GOAL!",
  "bends it top corner, no chance for the keeper — GOAL!",
];

/** Simulate the full 90-minute event timeline for one match + cycle. */
function simulateTimeline(matchId: string, home: TeamProfile, away: TeamProfile, cycle: number): MatchEvent[] {
  const rand = mulberry32(hashSeed(`${matchId}:${cycle}`));
  const events: MatchEvent[] = [];
  let momentum = 0; // -1 away dominant … +1 home dominant

  for (let minute = 1; minute <= 90; minute++) {
    momentum = momentum * 0.9 + (rand() - 0.5) * 0.4;
    const homeEdge = home.attack * (1 - away.defense) * (1 + Math.max(0, momentum));
    const awayEdge = away.attack * (1 - home.defense) * (1 + Math.max(0, -momentum));

    for (const [team, edge] of [["home", homeEdge], ["away", awayEdge]] as Array<[Side, number]>) {
      if (rand() < edge * 0.28) {
        const isGoal = rand() < 0.18;
        const attacker = team === "home" ? home.name : away.name;
        events.push({
          minute,
          type: isGoal ? "GOAL" : "CHANCE",
          team,
          detail: `${attacker} ${isGoal ? GOAL_LINES[Math.floor(rand() * GOAL_LINES.length)] : CHANCE_LINES[Math.floor(rand() * CHANCE_LINES.length)]}`,
        });
        if (isGoal) momentum += team === "home" ? 0.35 : -0.35;
      }
    }
    if (rand() < 0.03) {
      const team: Side = rand() < 0.5 ? "home" : "away";
      events.push({
        minute,
        type: "YELLOW",
        team,
        detail: `${team === "home" ? home.name : away.name} pick up a booking for a late challenge`,
      });
    }
  }
  return events;
}

const MATCH_REAL_MS = (90 * 60_000) / CONFIG.replaySpeed; // 90' compressed
const STAGGER_MS = MATCH_REAL_MS / 2; // overlapping kickoffs
const CYCLE_MS = STAGGER_MS * SLATE.length + MATCH_REAL_MS + 60_000; // + 1min interval

const bootTime = Date.now();

export function replayScoreboard(now = Date.now()): MatchState[] {
  const elapsed = now - bootTime;
  const cycle = Math.floor(elapsed / CYCLE_MS);
  const cycleElapsed = elapsed - cycle * CYCLE_MS;

  return SLATE.map((fixture, index) => {
    const kickoffOffset = index * STAGGER_MS;
    const sinceKickoff = cycleElapsed - kickoffOffset;
    const minute = Math.floor((sinceKickoff / MATCH_REAL_MS) * 90);
    const home = TEAMS[fixture.home];
    const away = TEAMS[fixture.away];
    const timeline = simulateTimeline(fixture.id, home, away, cycle);

    const status = minute < 0 ? "SCHEDULED" : minute >= 90 ? "FT" : "LIVE";
    const clampedMinute = Math.max(0, Math.min(90, minute));
    const events = timeline.filter((event) => event.minute <= clampedMinute);
    const homeScore = events.filter((e) => e.type === "GOAL" && e.team === "home").length;
    const awayScore = events.filter((e) => e.type === "GOAL" && e.team === "away").length;

    return {
      id: `${fixture.id}-c${cycle}`,
      stage: fixture.stage,
      home: fixture.home,
      away: fixture.away,
      homeScore,
      awayScore,
      minute: clampedMinute,
      status,
      kickoff: new Date(bootTime + cycle * CYCLE_MS + kickoffOffset).toISOString(),
      events,
    } satisfies MatchState;
  });
}

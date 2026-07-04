export type MatchStatus = "SCHEDULED" | "LIVE" | "FT";
export type Side = "home" | "away";

export interface MatchEvent {
  minute: number;
  type: "GOAL" | "CHANCE" | "YELLOW" | "RED" | "SUB";
  team: Side;
  detail: string;
}

export interface MatchState {
  id: string;
  stage: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** current match minute, 0 for scheduled, 90 for FT */
  minute: number;
  status: MatchStatus;
  kickoff: string; // ISO
  events: MatchEvent[];
}

export interface Scoreboard {
  source: "live" | "replay";
  competition: string;
  matches: MatchState[];
  fetchedAt: string;
}

/**
 * Unified match data provider.
 *
 * With FOOTBALL_DATA_TOKEN set → live FIFA World Cup 2026 data from
 * football-data.org (v4), cached 15s to respect free-tier rate limits.
 * Without a token → the REPLAY engine (see replay.ts), clearly labeled.
 */
import { CONFIG } from "../config.ts";
import { replayScoreboard } from "./replay.ts";
import type { MatchState, Scoreboard } from "./types.ts";

const FD_BASE = "https://api.football-data.org/v4";
const CACHE_MS = 15_000;

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  stage?: string;
  homeTeam: { name?: string; shortName?: string };
  awayTeam: { name?: string; shortName?: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}

let cache: { at: number; board: Scoreboard } | undefined;

function mapStatus(status: string): MatchState["status"] {
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(status)) return "LIVE";
  if (["FINISHED", "AWARDED"].includes(status)) return "FT";
  return "SCHEDULED";
}

async function fetchLive(token: string): Promise<Scoreboard> {
  const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { matches: FdMatch[] };

  const matches: MatchState[] = body.matches.map((m) => {
    const status = mapStatus(m.status);
    return {
      id: String(m.id),
      stage: (m.stage ?? "").replaceAll("_", " ").toLowerCase() || "world cup",
      home: m.homeTeam.shortName ?? m.homeTeam.name ?? "TBD",
      away: m.awayTeam.shortName ?? m.awayTeam.name ?? "TBD",
      homeScore: m.score.fullTime.home ?? 0,
      awayScore: m.score.fullTime.away ?? 0,
      minute: status === "FT" ? 90 : m.minute ?? (status === "LIVE" ? 45 : 0),
      status,
      kickoff: m.utcDate,
      events: [], // free tier exposes no event stream; analytics degrade gracefully
    };
  });

  // Surface live + today's matches first, cap payload size.
  const rank = (s: MatchState) => (s.status === "LIVE" ? 0 : s.status === "SCHEDULED" ? 1 : 2);
  matches.sort((a, b) => rank(a) - rank(b) || a.kickoff.localeCompare(b.kickoff));

  return {
    source: "live",
    competition: "FIFA World Cup 2026",
    matches: matches.slice(0, 12),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getScoreboard(): Promise<Scoreboard> {
  if (CONFIG.footballDataToken) {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.board;
    try {
      const board = await fetchLive(CONFIG.footballDataToken);
      cache = { at: Date.now(), board };
      return board;
    } catch (err) {
      console.error(`[data-forge] live feed failed, falling back to replay: ${String(err)}`);
    }
  }
  return {
    source: "replay",
    competition: "World Cup 2026 — replay slate",
    matches: replayScoreboard(),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getMatch(id: string): Promise<MatchState | undefined> {
  const board = await getScoreboard();
  return board.matches.find((m) => m.id === id);
}

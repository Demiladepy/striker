export interface LedgerEntry {
  ts: number;
  kind: "spend" | "earn" | "topup";
  amountMicro: string;
  counterparty: string;
  purpose: string;
  txHash: string;
  network: string;
  simulated: boolean;
}

export interface Insight {
  id: string;
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  headline: string;
  body: string;
  confidence: number;
  engine: "claude" | "template";
  costMicro: string;
  dataTxHash: string;
  simulated: boolean;
  ts: number;
}

export interface MatchSummary {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: "SCHEDULED" | "LIVE" | "FT";
  stage: string;
}

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
  graded: boolean;
  result?: Outcome;
  finalScore?: string;
  correct?: boolean;
  brier?: number;
}

export interface TrackRecord {
  calls: number;
  graded: number;
  open: number;
  correct: number;
  accuracy: number;
  meanBrier: number | null;
  skillScore: number | null;
  recent: Call[];
}

export interface AgentState {
  agent: {
    name: string;
    address: string;
    buyerAddress: string;
    mode: "live" | "sim";
    network: string;
    loopError: string | null;
  };
  balances: { address: string; usdcBalance: number; injBalance: number; mode: string; network: string };
  book: { earnedUsdc: number; spentUsdc: number; toppedUpUsdc: number; pnlUsdc: number; entryCount: number };
  trackRecord: TrackRecord;
  treasury: {
    floorUsdc: number;
    topupUsdc: number;
    inFlight?: { burnTxHash: string; amountUsdc: number; sourceChain: string; simulated: boolean; status: string };
    history: Array<{ burnTxHash: string; amountUsdc: number; sourceChain: string; simulated: boolean; status: string }>;
  };
  ledger: LedgerEntry[];
  insights: Insight[];
  board: { source: "live" | "replay"; competition: string; matches: MatchSummary[] } | null;
  prices: { insightUsdc: number };
}

export interface LedgerEntry {
  ts: number;
  kind: "spend" | "earn" | "topup" | "stake" | "stake_win";
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
  dataSource: "deep" | "signals";
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
  stakeMicro?: string;
  stakeSettled?: boolean;
  payoutMicro?: string;
  stakePnlMicro?: string;
  simulated: boolean;
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

export interface SignalMatch {
  matchId: string;
  fixture: string;
  minute: number;
  score: string;
  pressureIndex: number;
  momentum: { home: number; away: number };
  winProb: { home: number; draw: number; away: number };
}

export interface SignalsSnapshot {
  source: "live" | "replay";
  generatedAt: string;
  matches: SignalMatch[];
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
  book: {
    earnedUsdc: number;
    spentUsdc: number;
    toppedUpUsdc: number;
    pnlUsdc: number;
    stakedUsdc: number;
    stakeWonUsdc: number;
    stakePnlUsdc: number;
    entryCount: number;
  };
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
  signals: SignalsSnapshot | null;
  prices: { insightUsdc: number; deepUsdc: number; signalsUsdc: number };
}

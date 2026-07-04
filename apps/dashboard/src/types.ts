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

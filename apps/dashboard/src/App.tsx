import { useEffect, useState } from "react";
import type { AgentState, Call, Insight, LedgerEntry, MatchSummary, Outcome, SignalsSnapshot, TrackRecord } from "./types";

const EXPLORER = "https://testnet.blockscout.injective.network/tx/";
/** Deployed: set VITE_AGENT_URL to the agent's public URL. Local: vite proxy. */
const AGENT_BASE = import.meta.env.VITE_AGENT_URL ?? "/agent";

const usdc = (micro: string) => (Number(micro) / 1_000_000).toFixed(2);
const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function TxLink({ hash, simulated }: { hash: string; simulated: boolean }) {
  if (!hash || hash === "0x") return <span className="tx muted">—</span>;
  const short = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  return simulated ? (
    <span className="tx sim" title="simulated settlement — real EIP-3009 signature, not broadcast">
      SIM {short}
    </span>
  ) : (
    <a className="tx live" href={`${EXPLORER}${hash}`} target="_blank" rel="noreferrer">
      {short}
    </a>
  );
}

function MatchCard({ match }: { match: MatchSummary }) {
  return (
    <div className={`match ${match.status.toLowerCase()}`}>
      <div className="match-stage">{match.stage}</div>
      <div className="match-row">
        <span className="team">{match.home}</span>
        <span className="score">
          {match.homeScore}–{match.awayScore}
        </span>
        <span className="team away">{match.away}</span>
      </div>
      <div className="match-meta">
        {match.status === "LIVE" ? (
          <span className="live-dot">● {match.minute}&apos;</span>
        ) : match.status === "FT" ? (
          "FT"
        ) : (
          "upcoming"
        )}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="insight">
      <header>
        <span className="fixture">
          {insight.fixture} · {insight.minute}&apos; · {insight.score}
        </span>
        <span className="engine">
          {insight.dataSource === "signals" ? "📡 signals" : "🔬 deep"} ·{" "}
          {insight.engine === "claude" ? "claude" : "template"}
        </span>
      </header>
      <h3>{insight.headline}</h3>
      <p>{insight.body}</p>
      <footer>
        <span>confidence {(insight.confidence * 100).toFixed(0)}%</span>
        <span>
          data cost {usdc(insight.costMicro)} USDC · <TxLink hash={insight.dataTxHash} simulated={insight.simulated} />
        </span>
      </footer>
    </article>
  );
}

function outcomeLabel(call: Call, outcome: Outcome): string {
  const [home, away] = call.fixture.split(" vs ");
  return outcome === "home" ? home : outcome === "away" ? away : "draw";
}

function SignalRadar({ signals, signalsUsdc }: { signals: SignalsSnapshot | null; signalsUsdc: number }) {
  if (!signals) {
    return (
      <section className="panel">
        <h2>signal radar</h2>
        <p className="muted">waiting for STRIKER&apos;s first cross-match scout ({signalsUsdc} USDC via x402)…</p>
      </section>
    );
  }
  const sorted = [...signals.matches].sort((a, b) => b.pressureIndex - a.pressureIndex);
  return (
    <section className="panel">
      <h2>
        signal radar <span className="muted">({signalsUsdc} USDC sheet)</span>
      </h2>
      <div className="radar">
        {sorted.map((m) => (
          <div key={m.matchId} className="radar-row">
            <div className="radar-head">
              <span className="radar-fixture">{m.fixture}</span>
              <span className="muted">
                {m.minute}&apos; · {m.score}
              </span>
            </div>
            <div className="radar-bar-wrap">
              <div className="radar-track">
                <div className="radar-bar" style={{ width: `${m.pressureIndex}%` }} />
              </div>
              <span className="radar-val">{m.pressureIndex}</span>
            </div>
            <div className="radar-meta muted">
              momentum {m.momentum.home}/{m.momentum.away} · win prob{" "}
              {(m.winProb.home * 100).toFixed(0)}/{(m.winProb.draw * 100).toFixed(0)}/{(m.winProb.away * 100).toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackRecordPanel({ tr }: { tr: TrackRecord }) {
  const s = tr.stakes;
  return (
    <section className="panel full">
      <h2>track record — graded calls + prediction stakes on its own P&amp;L</h2>
      {tr.graded === 0 ? (
        <p className="muted">
          no calls settled yet — every paid insight is a logged win-prob call, graded the moment its
          match hits full time. {tr.open > 0 ? `${tr.open} open.` : ""}
          {s.enabled ? ` Stakes ${s.stakeUsdc} USDC when favoured ≥ ${(s.minFavoredProb * 100).toFixed(0)}%.` : ""}
        </p>
      ) : (
        <>
          <div className="tr-summary">
            <div>
              <label>accuracy</label>
              <strong className={tr.accuracy >= 0.5 ? "pos" : "neg"}>{(tr.accuracy * 100).toFixed(0)}%</strong>
              <span className="muted">{tr.correct}/{tr.graded} calls right</span>
            </div>
            <div>
              <label>brier score</label>
              <strong>{tr.meanBrier?.toFixed(3)}</strong>
              <span className="muted">lower is sharper</span>
            </div>
            <div>
              <label>skill vs coin-flip</label>
              <strong className={(tr.skillScore ?? 0) >= 0 ? "pos" : "neg"}>
                {(tr.skillScore ?? 0) >= 0 ? "+" : ""}
                {((tr.skillScore ?? 0) * 100).toFixed(0)}%
              </strong>
              <span className="muted">Brier skill score</span>
            </div>
            <div>
              <label>stake P&amp;L</label>
              <strong className={s.pnlUsdc >= 0 ? "pos" : "neg"}>
                {s.pnlUsdc >= 0 ? "+" : ""}
                {s.pnlUsdc.toFixed(3)}
              </strong>
              <span className="muted">
                {s.won}/{s.settled} stakes won · {s.open} open ({s.openStakeUsdc.toFixed(2)} USDC)
              </span>
            </div>
          </div>
          <div className="tr-calls">
            {tr.recent.map((c) => (
              <div key={c.id} className={`tr-call ${c.correct ? "hit" : "miss"}`}>
                <span className="tr-mark">{c.correct ? "✓" : "✗"}</span>
                <span className="tr-fixture">{c.fixture}</span>
                <span className="muted">
                  {c.minute}&apos; called <strong>{outcomeLabel(c, c.favored)}</strong> {(c.favoredProb * 100).toFixed(0)}%
                </span>
                <span className="muted">
                  → {c.finalScore} ({c.result ? outcomeLabel(c, c.result) : "?"})
                </span>
                {c.stakeMicro && (
                  <span className={`tr-stake ${c.stakeSettled ? (c.correct ? "pos" : "neg") : ""}`}>
                    {c.stakeSettled
                      ? c.correct
                        ? `+${usdc(String(Number(c.payoutMicro!) - Number(c.stakeMicro)))} stake`
                        : `−${usdc(c.stakeMicro)} stake`
                      : `${usdc(c.stakeMicro)} staked`}
                  </span>
                )}
                <span className="tr-brier">Brier {c.brier?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const sign = entry.kind === "spend" || entry.kind === "stake" ? "−" : "+";
  return (
    <tr className={entry.kind}>
      <td>{clock(entry.ts)}</td>
      <td className="amount">
        {sign}
        {usdc(entry.amountMicro)}
      </td>
      <td>{entry.kind}</td>
      <td className="purpose">{entry.purpose}</td>
      <td>
        <TxLink hash={entry.txHash} simulated={entry.simulated} />
      </td>
    </tr>
  );
}

export default function App() {
  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${AGENT_BASE}/api/state`);
        if (!res.ok) throw new Error(`agent responded ${res.status}`);
        const next = (await res.json()) as AgentState;
        if (!cancelled) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) {
    return (
      <div className="boot">
        <h1>⚡ STRIKER</h1>
        <p>{error ? `waiting for the agent… (${error})` : "connecting to the agent…"}</p>
        <p className="muted">start it with: npm run forge · npm run agent</p>
      </div>
    );
  }

  const live = state.board?.matches.filter((m) => m.status === "LIVE") ?? [];
  const pnlClass = state.book.pnlUsdc >= 0 ? "pos" : "neg";

  return (
    <div className="shell">
      <header className="topbar">
        <h1>
          ⚡ STRIKER <span className="tagline">the self-funding AI World Cup analyst</span>
        </h1>
        <div className="badges">
          <span className={`badge mode-${state.agent.mode}`}>
            {state.agent.mode === "live" ? "LIVE · Injective EVM testnet" : "SIM · real signatures, simulated settlement"}
          </span>
          <span className="badge">{state.board?.source === "live" ? "🌍 live World Cup feed" : "🎬 replay slate"}</span>
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <label>wallet</label>
          <strong>{state.balances.usdcBalance.toFixed(2)} USDC</strong>
          <span className="muted mono">{state.agent.address.slice(0, 10)}…</span>
        </div>
        <div className="stat">
          <label>earned</label>
          <strong className="pos">+{state.book.earnedUsdc.toFixed(2)}</strong>
          <span className="muted">selling insight via x402</span>
        </div>
        <div className="stat">
          <label>spent</label>
          <strong className="neg">−{state.book.spentUsdc.toFixed(2)}</strong>
          <span className="muted">buying data via x402</span>
        </div>
        <div className="stat">
          <label>P&amp;L</label>
          <strong className={pnlClass}>
            {state.book.pnlUsdc >= 0 ? "+" : ""}
            {state.book.pnlUsdc.toFixed(2)}
          </strong>
          <span className="muted">{state.book.entryCount} settlements</span>
        </div>
        <div className="stat">
          <label>track record</label>
          <strong className={state.trackRecord.graded && state.trackRecord.accuracy >= 0.5 ? "pos" : undefined}>
            {state.trackRecord.graded ? `${(state.trackRecord.accuracy * 100).toFixed(0)}%` : "—"}
          </strong>
          <span className="muted">
            {state.trackRecord.graded
              ? `${state.trackRecord.correct}/${state.trackRecord.graded} calls · ${state.trackRecord.open} open`
              : "grading at full time"}
          </span>
        </div>
        <div className="stat">
          <label>stake book</label>
          <strong className={state.book.stakePnlUsdc >= 0 ? "pos" : "neg"}>
            {state.book.stakePnlUsdc >= 0 ? "+" : ""}
            {state.book.stakePnlUsdc.toFixed(3)}
          </strong>
          <span className="muted">
            {state.trackRecord.stakes.placed} stakes · {state.trackRecord.stakes.stakeUsdc} USDC each
          </span>
        </div>
        <div className="stat">
          <label>CCTP treasury</label>
          <strong>{state.treasury.inFlight ? "⏳ top-up in flight" : "✓ solvent"}</strong>
          <span className="muted">
            floor {state.treasury.floorUsdc} · refill {state.treasury.topupUsdc} USDC
          </span>
        </div>
      </section>

      {state.agent.loopError && <div className="alert">loop: {state.agent.loopError}</div>}

      <main className="grid">
        <div className="side-col">
          <section className="panel">
            <h2>
              match board <span className="muted">({live.length} live)</span>
            </h2>
            <div className="matches">
              {state.board?.matches.map((m) => <MatchCard key={m.id} match={m} />) ?? <p>no feed yet</p>}
            </div>
          </section>

          <SignalRadar signals={state.signals} signalsUsdc={state.prices.signalsUsdc} />
        </div>

        <section className="panel wide">
          <h2>insight stream — {state.prices.insightUsdc} USDC per full read via x402</h2>
          <div className="insights">
            {state.insights.length === 0 ? (
              <p className="muted">STRIKER is watching… first paid buy lands on the next big moment.</p>
            ) : (
              state.insights.map((i) => <InsightCard key={i.id} insight={i} />)
            )}
          </div>
        </section>

        <TrackRecordPanel tr={state.trackRecord} />

        <section className="panel full">
          <h2>payment ledger — every x402, stake, and CCTP settlement</h2>
          <table>
            <thead>
              <tr>
                <th>time</th>
                <th>USDC</th>
                <th>kind</th>
                <th>purpose</th>
                <th>tx</th>
              </tr>
            </thead>
            <tbody>
              {state.ledger.map((entry, index) => (
                <LedgerRow key={`${entry.txHash}-${index}`} entry={entry} />
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="foot">
        built on Injective — x402 micropayments · CCTP treasury · MCP server ops · shipped as an Agent Skill
      </footer>
    </div>
  );
}

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

/** Polymarket-style market board — outcomes priced by STRIKER's live model. */
function MarketBoard({
  matches,
  signals,
  calls,
}: {
  matches: MatchSummary[];
  signals: SignalsSnapshot | null;
  calls: Call[];
}) {
  const priceFor = (matchId: string) => signals?.matches.find((m) => m.matchId === matchId)?.winProb;
  const positionFor = (matchId: string) => calls.find((c) => c.matchId === matchId && c.stakeMicro);
  const cents = (p: number) => `${Math.round(p * 100)}¢`;

  const cards = matches.filter((m) => m.status !== "FT" || m.homeScore + m.awayScore > 0).slice(0, 6);
  if (cards.length === 0) return null;

  return (
    <section className="panel full" id="markets">
      <h2>prediction markets — outcomes priced by STRIKER&apos;s paid model reads</h2>
      <div className="markets">
        {cards.map((m) => {
          const prob = priceFor(m.id);
          const pos = positionFor(m.id);
          const result: Outcome | undefined =
            m.status === "FT"
              ? m.homeScore > m.awayScore
                ? "home"
                : m.awayScore > m.homeScore
                  ? "away"
                  : "draw"
              : undefined;
          const outcomes: Array<{ key: Outcome; label: string; p?: number }> = [
            { key: "home", label: m.home, p: prob?.home },
            { key: "draw", label: "Draw", p: prob?.draw },
            { key: "away", label: m.away, p: prob?.away },
          ];
          const best = prob ? Math.max(prob.home, prob.draw, prob.away) : undefined;
          return (
            <article key={m.id} className={`market ${m.status.toLowerCase()}`}>
              <header>
                <span className="market-q">
                  {m.home} vs {m.away}
                </span>
                {m.status === "LIVE" ? (
                  <span className="live-dot">● {m.minute}&apos;</span>
                ) : m.status === "FT" ? (
                  <span className="market-resolved">RESOLVED {m.homeScore}–{m.awayScore}</span>
                ) : (
                  <span className="muted">opens at kickoff</span>
                )}
              </header>
              <div className="market-outcomes">
                {outcomes.map((o) => {
                  const price = result ? (result === o.key ? 1 : 0) : o.p;
                  const leading = result ? result === o.key : price !== undefined && price === best;
                  return (
                    <div key={o.key} className={`outcome ${leading ? "leading" : ""} ${result && result !== o.key ? "dead" : ""}`}>
                      <span className="outcome-name">{o.label}</span>
                      <span className="outcome-track">
                        <span className="outcome-bar" style={{ width: `${(price ?? 0) * 100}%` }} />
                      </span>
                      <span className={`outcome-price ${leading ? "up" : ""}`}>
                        {price === undefined ? "—" : cents(price)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <footer>
                {pos ? (
                  <span className={`market-pos ${pos.stakeSettled ? (pos.correct ? "pos" : "neg") : ""}`}>
                    STRIKER position: {outcomeLabel(pos, pos.favored)} @ {cents(pos.favoredProb)}
                    {pos.stakeSettled ? (pos.correct ? " · WON" : " · LOST") : ""}
                  </span>
                ) : m.status === "LIVE" && !prob ? (
                  <span className="muted">awaiting first paid read…</span>
                ) : (
                  <span className="muted">prices update with every x402 data buy</span>
                )}
              </footer>
            </article>
          );
        })}
      </div>
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
      <nav className="nav">
        <span className="nav-logo">⚡ STRIKER</span>
        <div className="nav-links">
          <a href="#board">Matches</a>
          <a href="#insights">Insights</a>
          <a href="#ledger">Ledger</a>
          <a href="https://github.com/Demiladepy/striker" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        <div className="badges">
          <span className={`badge mode-${state.agent.mode}`}>
            {state.agent.mode === "live" ? "LIVE · Injective EVM testnet" : "SIM · real signatures, simulated settlement"}
          </span>
          <span className="badge">{state.board?.source === "live" ? "🌍 live World Cup feed" : "🎬 replay slate"}</span>
        </div>
      </nav>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...state.ledger.slice(0, 14), ...state.ledger.slice(0, 14)].map((entry, i) => (
            <span key={i} className={`tick ${entry.kind}`}>
              {entry.kind === "spend" || entry.kind === "stake" ? "−" : "+"}
              {usdc(entry.amountMicro)} USDC · {entry.purpose.split(" · ")[0]}
            </span>
          ))}
        </div>
      </div>

      <header className="hero">
        <div className="hero-media" aria-hidden="true">
          <video autoPlay muted loop playsInline preload="metadata" src="/hero.mp4" />
          <div className="hero-veil" />
        </div>
        <div className="hero-inner">
        <p className="eyebrow">
          BUILT FOR THE INJECTIVE GLOBAL CUP <span className="eyebrow-line" />
        </p>
        <h1>
          The analyst that
          <br />
          pays its own way.
        </h1>
        <p className="hero-sub">
          STRIKER buys live World Cup data with x402 micropayments, sells its analysis the same way,
          and refills its treasury cross-chain — every settlement on-chain, no human in the loop.
        </p>
        <div className="hero-cta">
          <a className="btn-pill" href="https://github.com/Demiladepy/striker" target="_blank" rel="noreferrer">
            View the code
          </a>
          <a className="btn-play" href="#ledger">
            <span className="play-circle">▶</span> Watch the ledger live
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{state.balances.usdcBalance.toFixed(2)}</strong>
            <span>USDC in its wallet</span>
          </div>
          <div>
            <strong>{state.book.entryCount}</strong>
            <span>settlements recorded</span>
          </div>
          <div>
            <strong>{state.insights.length}</strong>
            <span>insights published</span>
          </div>
          <div>
            <strong>{live.length}</strong>
            <span>matches live now</span>
          </div>
        </div>
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
          <section className="panel" id="board">
            <h2>
              match board <span className="muted">({live.length} live)</span>
            </h2>
            <div className="matches">
              {state.board?.matches.map((m) => <MatchCard key={m.id} match={m} />) ?? <p>no feed yet</p>}
            </div>
          </section>

          <SignalRadar signals={state.signals} signalsUsdc={state.prices.signalsUsdc} />
        </div>

        <section className="panel wide" id="insights">
          <h2>insight stream — {state.prices.insightUsdc} USDC per full read via x402</h2>
          <div className="insights">
            {state.insights.length === 0 ? (
              <p className="muted">STRIKER is watching… first paid buy lands on the next big moment.</p>
            ) : (
              state.insights.map((i) => <InsightCard key={i.id} insight={i} />)
            )}
          </div>
        </section>

        <MarketBoard
          matches={state.board?.matches ?? []}
          signals={state.signals}
          calls={state.trackRecord.recent}
        />

        <TrackRecordPanel tr={state.trackRecord} />

        <section className="panel full" id="ledger">
          <h2>payment ledger — every x402, stake, and CCTP settlement</h2>
          <div className="table-scroll">
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
          </div>
        </section>
      </main>

      <footer className="mega-foot">
        <div className="foot-inner">
          <div className="foot-brand">
            <span className="nav-logo">⚡ STRIKER</span>
            <p>
              A self-funding AI World Cup analyst on Injective. It buys the data, sells the take,
              and settles every cent on-chain — x402, CCTP, MCP Server, Agent Skills.
            </p>
          </div>
          <div className="foot-grid">
            <div className="foot-col">
              <h4>Agent</h4>
              <span className="mono">{state.agent.address.slice(0, 20)}…</span>
              <a
                href={`https://testnet.blockscout.injective.network/address/${state.agent.address}`}
                target="_blank"
                rel="noreferrer"
              >
                Wallet on Blockscout
              </a>
              <span>{state.agent.network} · Injective EVM</span>
            </div>
            <div className="foot-col">
              <h4>Protocol</h4>
              <a href="https://docs.injective.network/developers-ai/x402" target="_blank" rel="noreferrer">
                x402 on Injective
              </a>
              <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer">
                Circle CCTP
              </a>
              <a href="https://github.com/InjectiveLabs/mcp-server" target="_blank" rel="noreferrer">
                Injective MCP Server
              </a>
            </div>
            <div className="foot-col">
              <h4>Navigate</h4>
              <a href="#board">Match board</a>
              <a href="#insights">Insight stream</a>
              <a href="#ledger">Payment ledger</a>
            </div>
          </div>
          <div className="foot-social">
            <a href="https://github.com/Demiladepy/striker" target="_blank" rel="noreferrer">
              GITHUB <span>↗</span>
            </a>
            <a href="https://x.com/injective" target="_blank" rel="noreferrer">
              X / TWITTER <span>↗</span>
            </a>
            <a href="https://injective.com" target="_blank" rel="noreferrer">
              INJECTIVE <span>↗</span>
            </a>
            <a href="https://testnet.blockscout.injective.network" target="_blank" rel="noreferrer">
              BLOCKSCOUT <span>↗</span>
            </a>
          </div>
        </div>
        <div className="foot-watermark" aria-hidden="true">
          STRIKER
        </div>
      </footer>
    </div>
  );
}

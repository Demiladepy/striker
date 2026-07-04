# ⚡ STRIKER — the self-funding AI World Cup analyst on Injective

> An autonomous agent that **buys** live World Cup data with x402 micropayments,
> **thinks** with Claude, **sells** its analysis through its own x402 storefront,
> and **refills its treasury cross-chain with CCTP** — a complete one-agent
> economy on Injective EVM, with every settlement on the ledger.

**Built for the [Injective Global Cup](https://xsxo494365r.typeform.com/to/TMaGb1du) · July 3–19, 2026**

---

## The problem

The World Cup generates the most-watched live data stream on Earth, but AI
agents can't buy it: sports data lives behind subscriptions, API keys, and
credit-card checkouts that a piece of software cannot pass. And even when an
agent *produces* valuable analysis, it has no way to charge for it.

STRIKER closes both gaps with one protocol. On Injective EVM, x402 turns any
HTTP endpoint into a pay-per-request service that settles in ~650ms — so
STRIKER pays for exactly the data it needs at the exact moment a match turns,
and charges anyone (human or agent) the same way for its takes. When its
wallet runs low, it tops itself up from another chain over Circle's CCTP.
No accounts. No API keys. No human in the loop.

```
                     0.02 USDC / call (x402)
   ┌────────────┐ ─────────────────────────────▶ ┌────────────┐
   │  STRIKER   │      deep match analytics      │ DATA FORGE │──▶ live World Cup feed
   │  the agent │ ◀───────────────────────────── │  data API  │    (football-data.org
   └────────────┘                                └────────────┘     or replay slate)
     ▲   │  ▲
     │   │  └── 0.05 USDC / insight (x402) ◀── fans · agents · anyone
     │   └──── Claude turns paid data into broadcast-grade insight
     │
   CCTP v2 top-up when balance < floor (reserve chain ──▶ Injective)
```

## How each Injective technology is used

### x402 — the core of the product, used on BOTH sides of the market
- **STRIKER as buyer**: the decision loop watches the free scoreboard and,
  when a goal lands or the pressure index spikes, pays the Data Forge
  `0.02 USDC` for deep analytics via [`@injectivelabs/x402`](https://www.npmjs.com/package/@injectivelabs/x402)
  (`createInjectiveClient` / EIP-3009 signed authorizations) —
  [`apps/agent/src/loop.ts`](apps/agent/src/loop.ts).
- **STRIKER as seller**: its own storefront gates `GET /api/insight` at
  `0.05 USDC` with the same protocol — [`apps/agent/src/storefront.ts`](apps/agent/src/storefront.ts).
- **The Data Forge** gates `/api/deep` and `/api/signals` with
  `injectivePaymentMiddleware` (settlement policy `after-success`, so a failed
  response never charges the payer) — [`apps/data-forge/src/server.ts`](apps/data-forge/src/server.ts).
- Shared engine: [`packages/x402kit`](packages/x402kit/src/paywall.ts) flips
  between **live** (real on-chain settlement on chain `1439`) and **sim**
  (identical HTTP flow, real EIP-712 signature recovery via
  `@injectivelabs/x402/protocol`'s `verifyPaymentRequest`, settlement not
  broadcast — receipts are explicitly flagged `simulated: true`).

### CCTP — the agent's autonomous treasury
When STRIKER's Injective USDC drops below a floor, the treasury policy fires a
**CCTP v2 `depositForBurn`** from a reserve wallet on a source chain (default
Ethereum Sepolia), minting native USDC to the agent's address on Injective —
[`apps/agent/src/cctp.ts`](apps/agent/src/cctp.ts) and
[`treasury.ts`](apps/agent/src/treasury.ts). Fast-Transfer finality threshold,
mint recipient encoding, and fee cap are implemented; contract addresses and
the destination domain are env-configured against
[Circle's docs](https://developers.circle.com/cctp). Sim mode models the
burn → attest → mint lifecycle with the same ledger events.

### MCP Server — wallet ops for agents
Ops on STRIKER's wallet (balances, funding, moving earnings, bridging) are
done through the official [Injective MCP Server](https://github.com/InjectiveLabs/mcp-server)
from Claude — config in [`.mcp.json.example`](.mcp.json.example), workflow in
the [Agent Skill](skills/worldcup-analyst/SKILL.md). The skill explicitly
routes wallet operations to MCP tools rather than hand-rolled RPC.

### Agent Skills — STRIKER as an ecosystem contribution
[`skills/worldcup-analyst`](skills/worldcup-analyst/SKILL.md) is an
installable Agent Skill: drop it into `~/.claude/skills/` and *your* Claude
becomes a paying STRIKER customer — it checks the free teasers, completes the
x402 payment cycle with the bundled payer script, and cites the settlement tx
hash back to you. We don't just use Agent Skills; we ship one.

## Quickstart — 30 seconds, zero configuration

```bash
npm install
npm run forge      # terminal 1 — the data API      (:4021)
npm run agent      # terminal 2 — STRIKER           (:4042)
npm run dashboard  # terminal 3 — the control room  (:5173)
```

Open http://localhost:5173. You'll see the replay slate kick off, STRIKER's
first paid data buy land in the ledger, and its first insight publish within
~30 seconds. Buy an insight yourself:

```bash
node skills/worldcup-analyst/scripts/ask-striker.mjs
```

You'll get the 402 quote, the signed payment, the settlement receipt, and the
full insight JSON.

> **Sim vs live, honestly:** with an empty `.env` everything above runs in
> **sim mode** — the HTTP protocol, EIP-3009 signatures, and cryptographic
> verification are real (Injective's own protocol code verifies every
> payment); only the on-chain broadcast is skipped, and every receipt is
> labeled `SIM` in the UI and `simulated: true` in the data.

### Going live (Injective EVM testnet, chain 1439)

```bash
npm run gen:wallets            # prints fresh keys + addresses
# fund the printed addresses: INJ (gas) + USDC
# faucet: https://testnet.faucet.injective.network
cp .env.example .env           # paste keys, set STRIKER_MODE=live
```

Optional power-ups in `.env`:
- `ANTHROPIC_API_KEY` — Claude writes the insights (template analyst otherwise)
- `FOOTBALL_DATA_TOKEN` — real World Cup 2026 fixtures from football-data.org
  (free tier) instead of the replay slate
- `CCTP_RESERVE_PRIVATE_KEY` + `CCTP_DEST_DOMAIN` — live cross-chain top-ups

## Repository map

```
packages/x402kit/          mode-switchable x402 paywall + buyer (the shared engine)
apps/data-forge/           x402-gated World Cup data API + analytics engine
apps/agent/                STRIKER: decision loop, brain, storefront, CCTP treasury, ledger, self-grading track record
apps/dashboard/            React control room: match board, insight stream, payment ledger, P&L
skills/worldcup-analyst/   installable Agent Skill + x402 payer script
scripts/gen-wallets.mjs    wallet bootstrap
```

## What the judges should poke at

1. `GET http://localhost:4021/api/deep?match=…` without a payment header → a
   proper `402` with a `PAYMENT-REQUIRED` quote.
2. The same request through the payer script → settlement receipt with a tx
   hash (Blockscout-linked in live mode).
3. The dashboard ledger: every entry is one x402 or CCTP settlement — the
   agent's entire economic life is auditable.
4. `apps/agent/src/treasury.ts`: the agent decides *by policy* when to move
   money across chains. Nobody clicks anything.
5. `GET http://localhost:4042/api/track-record` (free): STRIKER logs every
   win-probability call it sells and grades it against the final score with a
   Brier score. Its accuracy and skill-vs-coin-flip are on the dashboard —
   the analysis is measurable, not vibes ([`apps/agent/src/predictions.ts`](apps/agent/src/predictions.ts)).

## Roadmap (post-hackathon)

- Publish the Data Forge as a public x402 endpoint so any agent can buy the feed
- ERC-8004 identity mint on initialization via the Injective MCP Server
- Prediction-market settlement: STRIKER already self-grades its win-prob calls
  (Brier score, live on the dashboard) — next it stakes real P&L on them
- Multi-analyst marketplace: competing agents, one x402 rail

## License

MIT

---

*World Cup data via [football-data.org](https://www.football-data.org/) (live
mode) or a clearly-labeled replay slate (demo mode). STRIKER is a hackathon
project on Injective testnet; its insights are analysis, not betting advice.*

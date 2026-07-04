# STRIKER Launch Kit — Injective Global Cup

Everything scripted in advance so nothing is improvised under deadline
pressure. Deadline: **submit the Typeform July 18** (never the 19th).

---

## 1. Main X post (publish July 14–15, during the semifinals)

Early publish wins points-contest tiebreaks. Attach the demo clip or 3–4
screenshots (dashboard with live matches + the ledger).

> An AI analyst just paid for its own World Cup data — then got paid for its take. 🧠⚽
>
> Meet STRIKER: a self-funding AI analyst live during the #WorldCup knockouts, built on @injective.
>
> 💸 Buys deep match data per-request with **x402** micropayments (settles in ~650ms on Injective EVM)
> 📊 Sells its analysis through its own **x402** storefront — humans AND agents pay it
> 🌉 Refills its treasury cross-chain with **CCTP** when its USDC runs low
> 🛠️ Runs as an **MCP Server** — your Claude can buy its insights as a tool call
> 🎯 Ships an **Agent Skill** so any agent becomes a paying customer
>
> Every micro-payment is on the ledger. It even grades its own predictions with Brier scores and stakes USDC on the calls it trusts.
>
> No API keys. No subscriptions. No human in the loop.
>
> 🔗 github.com/Demiladepy/striker
>
> @injective @NinjaLabsHQ @NinjaLabsCN #InjectiveGlobalCupHackathon

Scoring check: demo/screenshots (+3), all four technologies named (+4 bonus).

## 2. Per-match comment template (+1 point per match, post in main thread)

During every live knockout match, screenshot the dashboard showing that match
and reply to the main post:

> 🔴 LIVE — {HOME} {score} {AWAY}, {minute}'
> STRIKER just paid {0.02} USDC via x402 for the deep read: {momentum}% momentum, win prob {H}/{D}/{A}.
> Settlement tx: {short hash / SIM}
> #InjectiveGlobalCupHackathon

Match windows (all during hackathon): QFs ~July 9–11 · SFs ~July 14–15 ·
Final July 19. One comment per match, minimum.

## 3. Demo video script (90 seconds, record July 14–15 with a real match live)

| t | Scene | Line |
|---|---|---|
| 0–10s | Dashboard, P&L ticking, live match on the board | "This AI analyst has its own wallet. Watch it work a real World Cup match." |
| 10–25s | The problem (2 title cards) | "AI agents can't buy sports data — paywalls need credit cards and API keys. And when an agent produces good analysis, it can't charge for it." |
| 25–45s | Terminal: unpaid request → 402; buyer pays; ledger entry appears | "x402 on Injective fixes both. A 402 quote, a signed USDC authorization, settled in under a second. STRIKER pays 2 cents for deep analytics the moment a goal lands." |
| 45–60s | Insight publishes; skill script buys it; `earn` entry lands | "It turns that data into a broadcast-grade read — and sells it the same way. This buyer is another AI agent, paying 5 cents over the same protocol." |
| 60–75s | Track record panel + stake settling; treasury card + CCTP top-up | "It grades its own predictions with Brier scores, stakes USDC on the calls it trusts, and when the wallet runs low — a CCTP top-up from another chain. Domain 29, straight to Injective." |
| 75–90s | MCP tool call in Claude; end card with repo + logos | "It's an MCP server, an Agent Skill, and an open repo. STRIKER — the self-funding AI World Cup analyst, on Injective." |

Recording notes: 1080p minimum, dark theme, hide bookmarks bar, live-mode tx
hashes on screen (Blockscout tab open in second monitor for one click-through).

## 4. Submission checklist ([Typeform](https://xsxo494365r.typeform.com/to/TMaGb1du))

- [ ] Project name: **STRIKER — the self-funding AI World Cup analyst on Injective**
- [ ] Description: 2–3 sentences from the README hero
- [ ] GitHub: https://github.com/Demiladepy/striker (public, README current)
- [ ] Demo link: deployed dashboard URL (or Loom of local run as fallback)
- [ ] Demo video: uploaded (YouTube unlisted or X-native)
- [ ] Main X post published with all tags + hashtag
- [ ] Per-match comments posted for every knockout match watched

## 5. Remaining engineering runway

| Date | Milestone |
|---|---|
| Jul 5–6 | Live-mode dry run: fund wallets, real settlement on 1439, Blockscout links verified |
| Jul 7–8 | Deploy: dashboard (Vercel) + forge/agent (Railway/VPS); ERC-8004 identity mint stretch goal |
| Jul 9–11 | **Quarterfinals — live artifacts.** Screenshot every match. Feature freeze after. |
| Jul 12–13 | README polish, test pass, repo hygiene |
| Jul 14–15 | **Semifinals — record video, publish main X post** |
| Jul 16–17 | Bug-fix only; per-match comments continue |
| Jul 18 | **Submit Typeform** |
| Jul 19 | Final — last live screenshots in the comments |

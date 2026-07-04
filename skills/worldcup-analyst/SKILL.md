---
name: worldcup-analyst
description: Query STRIKER, the self-funding AI World Cup analyst on Injective. Use when the user asks for live World Cup match analysis, momentum reads, win probabilities, or wants to buy a STRIKER insight. Pays per request with x402 USDC micropayments on Injective EVM — no API keys, no accounts.
---

# STRIKER World Cup Analyst

STRIKER is an autonomous analyst agent that buys deep World Cup data with x402
micropayments on Injective EVM and sells its analysis the same way. This skill
makes you one of its paying customers.

## Endpoints

Default host: `http://localhost:4042` (override with `STRIKER_HOST`).

| Endpoint | Price | What you get |
|---|---|---|
| `GET /api/insights/teasers` | free | Latest headlines — the shop window |
| `GET /api/insight` | 0.05 USDC via x402 | Freshest full insight (momentum %, win prob, broadcast-grade read) |
| `GET /api/insight?match=<id>` | 0.05 USDC via x402 | Full insight for one match |
| `GET /api/state` | free | Agent wallet, P&L, ledger, live match board |

The Data Forge (`http://localhost:4021`) sells the raw feed the same way:
free `GET /api/matches` scoreboard, paid `GET /api/deep?match=<id>` (0.02 USDC)
and `GET /api/signals` (0.01 USDC).

## How to buy an insight

Run the bundled payer script (it completes the 402 → sign EIP-3009 → retry
cycle automatically):

```bash
node scripts/ask-striker.mjs                # freshest insight
node scripts/ask-striker.mjs --match <id>   # one specific match
node scripts/ask-striker.mjs --teasers      # free headlines, no payment
```

Set `STRIKER_PAYER_KEY` to pay from a specific Injective EVM testnet wallet;
without it the script generates an ephemeral key, which works against a
sim-mode STRIKER (real signature, simulated settlement).

## Workflow

1. Check the free board first: `GET /api/state` → pick the hottest LIVE match.
2. Buy the insight for that match with the script.
3. Relay the headline, the win probabilities, and the momentum split to the
   user, and cite the settlement tx hash from the `PAYMENT-RESPONSE` receipt
   so they can verify the payment on
   https://testnet.blockscout.injective.network (live mode).

## Wallet operations (Injective MCP Server)

For anything beyond buying insights — checking the payer wallet's USDC
balance, funding it, or moving earnings — use the official Injective MCP
Server (`github.com/InjectiveLabs/mcp-server`) if it is connected, instead of
hand-rolling RPC calls.

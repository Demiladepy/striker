// Live-mode smoke test: pay the Data Forge for deep analytics with a REAL
// x402 settlement on Injective EVM testnet, then confirm the tx on-chain.
// Usage: node scripts/live-smoke.mjs
import { createInjectiveClient, parsePaymentResponseHeader } from "@injectivelabs/x402/client";
import { createPublicClient, http } from "viem";
import { config } from "dotenv";
config();

const FORGE = process.env.FORGE_HOST ?? "http://localhost:4021";

const board = await (await fetch(`${FORGE}/api/matches`)).json();
const match = board.matches.find((m) => m.status === "LIVE") ?? board.matches[0];
console.log(`buying deep analytics for: ${match.home} vs ${match.away} (${match.status}) [source: ${board.source}]`);

const client = createInjectiveClient({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  rpcUrl: process.env.INJECTIVE_RPC_URL,
  preferredNetworks: ["eip155:1439"],
});

const started = Date.now();
const res = await client.fetch(`${FORGE}/api/deep?match=${encodeURIComponent(match.id)}`);
console.log(`response: ${res.status} in ${Date.now() - started}ms`);
if (!res.ok) { console.error(await res.text()); process.exit(1); }

const receipt = parsePaymentResponseHeader(res);
const deep = await res.json();
console.log(`insight data: winProb ${JSON.stringify(deep.winProb)} · pressure ${deep.pressureIndex}`);
if (!receipt) { console.error("no PAYMENT-RESPONSE header — was the forge running in live mode?"); process.exit(1); }
console.log(`settlement: tx ${receipt.transaction}`);
console.log(`payer:      ${receipt.payer}`);
console.log(`explorer:   https://testnet.blockscout.injective.network/tx/${receipt.transaction}`);

// confirm on-chain (retry — the testnet RPC receipt index lags a little)
const pub = createPublicClient({ transport: http(process.env.INJECTIVE_RPC_URL ?? "https://testnet.sentry.chain.json-rpc.injective.network") });
for (let i = 0; i < 12; i++) {
  const r = await pub.getTransactionReceipt({ hash: receipt.transaction }).catch(() => null);
  if (r) { console.log(`ON-CHAIN CONFIRMED: status=${r.status}, block=${r.blockNumber}`); process.exit(0); }
  await new Promise((s) => setTimeout(s, 3000));
}
console.log("tx not indexed after 36s — check the explorer link manually");

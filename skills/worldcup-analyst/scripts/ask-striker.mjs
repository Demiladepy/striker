#!/usr/bin/env node
/**
 * Buy a STRIKER insight over x402.
 *
 *   node ask-striker.mjs                → freshest paid insight
 *   node ask-striker.mjs --match <id>   → insight for one match
 *   node ask-striker.mjs --teasers      → free headlines (no payment)
 *
 * Env: STRIKER_HOST (default http://localhost:4042)
 *      STRIKER_PAYER_KEY (0x… private key; ephemeral if unset)
 */
import {
  createPayment,
  encodePaymentSignatureHeader,
  parsePaymentRequired,
  parsePaymentResponseHeader,
} from "@injectivelabs/x402/client";
import { generatePrivateKey } from "viem/accounts";

const host = process.env.STRIKER_HOST ?? "http://localhost:4042";
const args = process.argv.slice(2);

if (args.includes("--teasers")) {
  const res = await fetch(`${host}/api/insights/teasers`);
  console.log(JSON.stringify(await res.json(), null, 2));
  process.exit(0);
}

const matchIndex = args.indexOf("--match");
const matchId = matchIndex >= 0 ? args[matchIndex + 1] : undefined;
const url = `${host}/api/insight${matchId ? `?match=${encodeURIComponent(matchId)}` : ""}`;
const privateKey = process.env.STRIKER_PAYER_KEY ?? generatePrivateKey();

const first = await fetch(url);
if (first.status !== 402) {
  console.log(JSON.stringify(await first.json(), null, 2));
  process.exit(0);
}

const header = first.headers.get("PAYMENT-REQUIRED");
const required = header ? parsePaymentRequired(header) : await first.json();
const requirements = required.accepts[0];
console.error(
  `💸 402 received — paying ${Number(requirements.amount) / 1e6} USDC on ${requirements.network} to ${requirements.payTo}`,
);

const payload = await createPayment({ privateKey }, requirements);
const paid = await fetch(url, {
  headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
});
if (!paid.ok) {
  console.error(`payment rejected: ${paid.status} ${await paid.text()}`);
  process.exit(1);
}

const receipt = parsePaymentResponseHeader(paid);
if (receipt) console.error(`🧾 settled — tx ${receipt.transaction} (payer ${receipt.payer})`);
console.log(JSON.stringify(await paid.json(), null, 2));

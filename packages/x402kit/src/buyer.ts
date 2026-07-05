/**
 * Mode-switchable x402 buyer.
 *
 * live — createInjectiveClient from @injectivelabs/x402: signs a real EIP-3009
 *        authorization and the facilitator settles it on Injective EVM.
 *
 * sim  — performs the identical 402 → sign → retry dance with the package's
 *        own createPayment (a REAL EIP-712 signature over the transfer
 *        authorization), against a sim paywall that verifies it for real and
 *        skips only the on-chain broadcast.
 */
import {
  createInjectiveClient,
  createPayment,
  encodePaymentSignatureHeader,
  parsePaymentRequired,
  parsePaymentResponseHeader,
} from "@injectivelabs/x402/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { Buyer, BuyerOptions, PaidReceipt } from "./types.ts";

function receiptFrom(res: Response): PaidReceipt | undefined {
  const receipt = parsePaymentResponseHeader(res);
  if (!receipt || !receipt.success) return undefined;
  const raw = res.headers.get("PAYMENT-RESPONSE");
  let simulated = false;
  if (raw) {
    try {
      simulated = Boolean(
        (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { simulated?: boolean })
          .simulated,
      );
    } catch {
      /* absent flag means a live receipt */
    }
  }
  return {
    txHash: receipt.transaction,
    payer: receipt.payer,
    network: receipt.network,
    simulated,
  };
}

export function makeBuyer(options: BuyerOptions): Buyer {
  const privateKey: Hex = options.privateKey ?? generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;

  if (options.mode === "live") {
    if (!options.privateKey) {
      throw new Error("live buyer requires a funded payer privateKey");
    }
    const client = createInjectiveClient({
      privateKey,
      rpcUrl: options.rpcUrl,
      preferredNetworks: [options.network],
    });
    return {
      address,
      fetch: (url, init) => client.fetch(url, init),
      lastReceipt: receiptFrom,
    };
  }

  // ── sim mode: same protocol, same signatures, no broadcast ─────────────
  return {
    address,
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const first = await fetch(url, init);
      if (first.status !== 402) return first;

      const header = first.headers.get("PAYMENT-REQUIRED");
      const required = header
        ? parsePaymentRequired(header)
        : (JSON.parse(await first.text()) as ReturnType<typeof parsePaymentRequired>);
      const requirements = required.accepts.find((a) => a.network === options.network)
        ?? required.accepts[0];
      if (!requirements) throw new Error(`402 from ${url} offered no payment options`);

      const payload = await createPayment({ privateKey, rpcUrl: options.rpcUrl }, requirements);
      const headers = new Headers(init?.headers);
      headers.set("PAYMENT-SIGNATURE", encodePaymentSignatureHeader(payload));
      return fetch(url, { ...init, headers });
    },
    lastReceipt: receiptFrom,
  };
}

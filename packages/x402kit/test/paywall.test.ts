/**
 * End-to-end protocol tests for the sim paywall + buyer pair.
 *
 * These exercise the REAL @injectivelabs/x402 code paths: the buyer signs a
 * genuine EIP-3009 authorization and the paywall verifies it with the
 * package's own verifyPaymentRequest (signature recovery, expiry, replay).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { makeBuyer, makePaywall, type SettlementRecord } from "../src/index.ts";

const settlements: SettlementRecord[] = [];
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(
    makePaywall({
      mode: "sim",
      network: "eip155:1439",
      routes: {
        "GET /paid": { description: "test resource", amount: "20000" },
      },
      onSettle: (record) => settlements.push(record),
    }),
  );
  app.get("/paid", (_req, res) => res.json({ secret: "striker" }));
  app.get("/free", (_req, res) => res.json({ open: true }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  if (typeof address === "object" && address) base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server?.close();
});

describe("x402 sim paywall", () => {
  it("returns 402 with a PAYMENT-REQUIRED quote when unpaid", async () => {
    const res = await fetch(`${base}/paid`);
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const quote = JSON.parse(Buffer.from(header!, "base64").toString("utf8"));
    expect(quote.x402Version).toBe(2);
    expect(quote.accepts[0].amount).toBe("20000");
    expect(quote.accepts[0].network).toBe("eip155:1439");
  });

  it("leaves free routes untouched", async () => {
    const res = await fetch(`${base}/free`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ open: true });
  });

  it("completes the 402 → sign → retry cycle and issues a receipt", async () => {
    const buyer = makeBuyer({ mode: "sim", network: "eip155:1439" });
    const res = await buyer.fetch(`${base}/paid`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ secret: "striker" });

    const receipt = buyer.lastReceipt(res);
    expect(receipt).toBeDefined();
    expect(receipt!.simulated).toBe(true);
    expect(receipt!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt!.payer.toLowerCase()).toBe(buyer.address.toLowerCase());

    expect(settlements.length).toBeGreaterThan(0);
    const settled = settlements.at(-1)!;
    expect(settled.direction).toBe("earn");
    expect(settled.amount).toBe("20000");
    expect(settled.payer.toLowerCase()).toBe(buyer.address.toLowerCase());
  });

  it("rejects a replayed payment signature (nonce reuse)", async () => {
    const buyer = makeBuyer({ mode: "sim", network: "eip155:1439" });
    const first = await buyer.fetch(`${base}/paid`);
    expect(first.status).toBe(200);

    // Capture nothing from the buyer — instead replay by re-sending the exact
    // signed header. Reconstruct it via a manual dance: get a fresh quote,
    // pay once manually, then send the same header twice.
    const { createPayment, encodePaymentSignatureHeader, parsePaymentRequired } = await import(
      "@injectivelabs/x402/client"
    );
    const { generatePrivateKey } = await import("viem/accounts");

    const quoteRes = await fetch(`${base}/paid`);
    const required = parsePaymentRequired(quoteRes.headers.get("PAYMENT-REQUIRED")!);
    const payload = await createPayment({ privateKey: generatePrivateKey() }, required.accepts[0]);
    const header = encodePaymentSignatureHeader(payload);

    const paidOnce = await fetch(`${base}/paid`, { headers: { "PAYMENT-SIGNATURE": header } });
    expect(paidOnce.status).toBe(200);

    const replayed = await fetch(`${base}/paid`, { headers: { "PAYMENT-SIGNATURE": header } });
    expect(replayed.status).toBe(402);
  });

  it("rejects a garbage payment header", async () => {
    const res = await fetch(`${base}/paid`, {
      headers: { "PAYMENT-SIGNATURE": Buffer.from("{\"junk\":true}").toString("base64") },
    });
    expect(res.status).toBe(402);
  });
});

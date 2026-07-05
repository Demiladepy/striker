/**
 * Mode-switchable x402 paywall for Express.
 *
 * live — delegates to @injectivelabs/x402's injectivePaymentMiddleware:
 *        real EIP-3009 verification and real on-chain settlement through a
 *        local facilitator wallet (settlementPolicy "after-success").
 *
 * sim  — mirrors the exact same HTTP protocol (402 + PAYMENT-REQUIRED,
 *        PAYMENT-SIGNATURE in, PAYMENT-RESPONSE receipt out) and runs the
 *        REAL protocol verification from @injectivelabs/x402/protocol —
 *        signatures are cryptographically recovered, nonces are replay-checked
 *        — but chain reads are stubbed and settlement is not broadcast.
 *        Receipts carry `simulated: true` and a synthetic tx hash.
 */
import { randomBytes } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { injectivePaymentMiddleware } from "@injectivelabs/x402/middleware";
import {
  decodePaymentSignatureHeader,
} from "@injectivelabs/x402/client";
import {
  createFacilitatorRequest,
  normalizeFacilitatorRequest,
  verifyPaymentRequest,
} from "@injectivelabs/x402/protocol";
import { getToken, getTokenByAddress } from "@injectivelabs/x402/networks";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import type { PaywallOptions, SettlementRecord } from "./types.ts";

interface PaymentRequirementsShape {
  scheme: "exact";
  network: string;
  amount: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

function usdcAddress(network: PaywallOptions["network"]): Address {
  const token = getToken(network, "USDC");
  if (!token) throw new Error(`USDC not registered for ${network}`);
  return token.address;
}

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function simTxHash(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

export function walletAddress(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}

export function makePaywall(options: PaywallOptions): RequestHandler {
  const key = options.privateKey ?? generatePrivateKey();
  const payTo = walletAddress(key);

  if (options.mode === "live") {
    if (!options.privateKey) {
      throw new Error("live paywall requires a funded facilitator privateKey");
    }
    const routeMap = Object.fromEntries(
      Object.entries(options.routes).map(([pattern, route]) => [
        pattern,
        {
          description: route.description,
          accepts: [
            {
              network: options.network,
              asset: usdcAddress(options.network),
              amount: route.amount,
            },
          ],
        },
      ]),
    );
    // "before" (verify → settle → handler): the rc.1 "after-success" path
    // re-emits the response without HTTP framing (raw JSON on the socket, no
    // status line), which strict clients like undici reject. Our paid routes
    // are read-only lookups, so charging before the handler is safe.
    const inner = injectivePaymentMiddleware(routeMap, {
      facilitator: { privateKey: key, rpcUrl: options.rpcUrl },
      settlementPolicy: "before",
    });
    // Wrap to ledger earnings off the receipt header once the response flushes.
    return (req: Request, res: Response, next: NextFunction) => {
      const pattern = `${req.method} ${req.path}`;
      const route = options.routes[pattern];
      if (route && options.onSettle) {
        res.on("finish", () => {
          const receiptHeader = res.getHeader("PAYMENT-RESPONSE");
          if (typeof receiptHeader !== "string" || res.statusCode >= 300) return;
          try {
            const receipt = JSON.parse(
              Buffer.from(receiptHeader, "base64").toString("utf8"),
            ) as { success: boolean; transaction: Hex; network: string; payer: Address };
            if (!receipt.success) return;
            options.onSettle?.({
              direction: "earn",
              amount: route.amount,
              payer: receipt.payer,
              payTo,
              resource: pattern,
              txHash: receipt.transaction,
              network: receipt.network,
              simulated: false,
              ts: Date.now(),
            });
          } catch {
            /* receipt header not parseable — skip ledgering, never break the response */
          }
        });
      }
      inner(req, res, next);
    };
  }

  // ── sim mode ────────────────────────────────────────────────────────────
  const usedNonces = new Set<string>();
  const asset = usdcAddress(options.network);

  return async (req: Request, res: Response, next: NextFunction) => {
    const pattern = `${req.method} ${req.path}`;
    const route = options.routes[pattern];
    if (!route) return next();

    const requirements: PaymentRequirementsShape = {
      scheme: "exact",
      network: options.network,
      amount: route.amount,
      asset,
      payTo,
      maxTimeoutSeconds: 60,
      extra: {},
    };
    const resourceUrl = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;

    const header = req.get("PAYMENT-SIGNATURE") ?? req.get("X-PAYMENT");
    if (!header) {
      const paymentRequired = {
        x402Version: 2 as const,
        resource: { url: resourceUrl, description: route.description },
        accepts: [requirements],
      };
      res
        .status(402)
        .set("PAYMENT-REQUIRED", b64(paymentRequired))
        .json(paymentRequired);
      return;
    }

    try {
      const paymentPayload = decodePaymentSignatureHeader(header);
      const normalized = normalizeFacilitatorRequest(
        createFacilitatorRequest({
          paymentPayload,
          paymentRequirements: requirements as never,
        }),
      );
      // REAL protocol verification (EIP-712 signature recovery, amount/expiry/
      // replay checks) with chain reads stubbed for offline demo settlement.
      const verdict = await verifyPaymentRequest(normalized, {
        getBalance: async () => 10n ** 15n,
        isNonceUsed: async (_asset, _payer, nonce) => usedNonces.has(nonce),
        getTokenName: async (tokenAddress, network) =>
          getTokenByAddress(network, tokenAddress)?.name ?? "USDC",
      });

      if (!verdict.isValid) {
        res.status(402).json({
          x402Version: 2,
          error: verdict.invalidReason ?? "payment verification failed",
          resource: { url: resourceUrl, description: route.description },
          accepts: [requirements],
        });
        return;
      }

      usedNonces.add(paymentPayload.payload.authorization.nonce);
      const payer = (verdict.payer ?? paymentPayload.payload.authorization.from) as Address;
      const txHash = simTxHash();
      res.set(
        "PAYMENT-RESPONSE",
        b64({ success: true, transaction: txHash, network: options.network, payer, simulated: true }),
      );
      (req as Request & { x402?: unknown }).x402 = { payer, txHash, simulated: true };
      options.onSettle?.({
        direction: "earn",
        amount: route.amount,
        payer,
        payTo,
        resource: pattern,
        txHash,
        network: options.network,
        simulated: true,
        ts: Date.now(),
      });
      next();
    } catch (err) {
      res.status(402).json({
        x402Version: 2,
        error: `malformed payment: ${err instanceof Error ? err.message : String(err)}`,
        accepts: [requirements],
      });
    }
  };
}

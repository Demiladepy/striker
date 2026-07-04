/**
 * CORS for x402 endpoints. The payment dance rides custom HTTP headers, so a
 * cross-origin buyer (deployed dashboard, browser-based agent) must be allowed
 * to SEND the signature header and READ the quote/receipt headers.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function x402Cors(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE",
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

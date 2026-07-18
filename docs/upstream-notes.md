# Upstream findings — Injective x402 stack (July 2026)

Two platform issues found, reproduced, and worked around while running STRIKER
live during the World Cup knockouts. Documented here for the InjectiveLabs
team; happy to open issues/PRs on the relevant repos.

## 1. Default testnet RPC serves stale transaction receipts

**Endpoint:** `https://k8s.testnet.json-rpc.injective.network` (the default in
`@injectivelabs/x402/networks` for `eip155:1439`).

**Symptom:** `eth_getTransactionReceipt` returns *not found* for minutes after
a transaction is mined, while `eth_getBalance` reflects the same transaction
instantly — likely a lagging replica behind the load balancer. Any code using
viem's `waitForTransactionReceipt` against this RPC times out even though the
tx succeeded: for x402 this makes the facilitator's settlement wait fail
**after** funds moved, so the payer is charged and the request 402s anyway.

**Repro:** send any tx on 1439 via the k8s RPC; poll `eth_getTransactionReceipt`
(missing for 60s+) while `eth_getBalance` shows the transfer applied.
`https://testnet.sentry.chain.json-rpc.injective.network` returns the same
receipt in ~2s.

**Suggested fix:** point the package default at the sentry RPC, or make
receipt-serving replicas sticky. Our workaround: an `rpcUrl` override threaded
through facilitator + client config.

## 2. `@injectivelabs/x402@0.1.0-rc.1` — `settlementPolicy: "after-success"` emits unframed HTTP

**Symptom:** with the Express middleware in `after-success` mode, the deferred
response replay writes the handler body to the socket **without an HTTP status
line/headers**. Strict HTTP/1.1 clients (Node's `undici`/`fetch`) reject the
response with `HPE_INVALID_CONSTANT: Response does not match the HTTP/1.1
protocol` — the socket payload begins with the raw JSON body. Both the success
path and the settlement-error path are affected.

**Repro:** protect any Express route with
`injectivePaymentMiddleware(routes, { facilitator, settlementPolicy: "after-success" })`,
pay it with `createInjectiveClient(...).fetch(...)` from Node 22 — the fetch
throws `HPE_INVALID_CONSTANT` while the settlement itself succeeds on-chain.

**Suggested fix:** the deferred-write interceptor should replay through the
original `res.writeHead`/`res.end` chain rather than the raw socket. Our
workaround: `settlementPolicy: "before"` (acceptable for idempotent read-only
routes; loses the implicit-refund property).

---

*Found by the STRIKER team while processing 100+ live x402 settlements during
World Cup 2026 knockout matches — see the ledger at
https://striker-three.vercel.app.*

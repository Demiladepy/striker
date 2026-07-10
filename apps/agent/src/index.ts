/**
 * Entry shim: register fatal-error logging BEFORE any module loads, then boot.
 * Guarantees a readable stack in hosted logs (Render, Railway) instead of a
 * bare "exited with status 1" when boot-time config is wrong.
 */
process.on("uncaughtException", (err) => {
  console.error(`[striker] FATAL uncaught exception: ${err.stack ?? err.message}`);
  process.exit(1);
});
// Log-only: a stray rejection (transient RPC outage, dropped socket) must not
// kill a long-running agent. Boot failures are covered by the import guard.
process.on("unhandledRejection", (reason) => {
  console.error(`[striker] unhandled rejection (continuing): ${reason instanceof Error ? reason.stack : String(reason)}`);
});

try {
  await import("./boot.ts");
} catch (err) {
  console.error(
    `[striker] FATAL boot failure: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
}

export {};

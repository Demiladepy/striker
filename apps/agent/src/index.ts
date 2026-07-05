/**
 * Entry shim: register fatal-error logging BEFORE any module loads, then boot.
 * Guarantees a readable stack in hosted logs (Render, Railway) instead of a
 * bare "exited with status 1" when boot-time config is wrong.
 */
process.on("uncaughtException", (err) => {
  console.error(`[striker] FATAL uncaught exception: ${err.stack ?? err.message}`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[striker] FATAL unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
  process.exit(1);
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

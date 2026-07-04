/**
 * STRIKER — the self-funding AI World Cup analyst on Injective.
 *
 *   buys data   → x402 micropayments to the Data Forge (Injective EVM 1439)
 *   thinks      → Claude (or the built-in template analyst)
 *   sells alpha → its own x402 storefront
 *   stays solvent → CCTP v2 top-ups from a reserve chain
 */
import { CONFIG } from "./config.ts";
import { account } from "./wallet.ts";
import { startLoop } from "./loop.ts";
import { startStorefront } from "./storefront.ts";

console.log(`
   ███████ STRIKER ███████
   self-funding AI World Cup analyst
   wallet   ${account.address}
   mode     ${CONFIG.mode.toUpperCase()}${CONFIG.mode === "sim" ? " (real signatures, simulated settlement — fund wallets + set STRIKER_MODE=live to go on-chain)" : ""}
   network  ${CONFIG.network} (Injective EVM testnet)
   brain    ${CONFIG.anthropicKey ? CONFIG.model : "template analyst (set ANTHROPIC_API_KEY for Claude)"}
`);

startStorefront();
startLoop();

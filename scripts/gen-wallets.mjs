// Generates fresh Injective EVM wallets for STRIKER and prints .env lines.
// Usage: npm run gen:wallets
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const roles = ["AGENT_PRIVATE_KEY", "FORGE_PRIVATE_KEY", "CCTP_RESERVE_PRIVATE_KEY"];

console.log("# Paste into .env — then fund the addresses below on Injective EVM testnet (chain 1439)");
console.log("# Faucet: https://testnet.faucet.injective.network\n");
for (const role of roles) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  console.log(`${role}=${pk}`);
  console.log(`# ${role.replace("_PRIVATE_KEY", "")} address: ${account.address}\n`);
}

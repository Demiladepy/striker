// Provisions a SECOND wallet pair for the cloud (Render) deployment so the
// public demo can run live mode without sharing keys with the local agent
// (shared keys = nonce collisions between two facilitators).
//
// Generates cloud-agent + cloud-forge keys, funds them from the local agent
// wallet (INJ for gas, USDC for the cloud agent's buys), prints everything.
// Usage: node scripts/fund-cloud.mjs
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config } from "dotenv";
config();

const RPC = process.env.INJECTIVE_RPC_URL ?? "https://testnet.sentry.chain.json-rpc.injective.network";
const USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
const chain = { id: 1439, name: "Injective EVM Testnet", nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

const funder = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: funder, chain, transport: http(RPC) });

const [inj, usdc] = await Promise.all([
  pub.getBalance({ address: funder.address }),
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [funder.address] }),
]);
console.log(`funder ${funder.address}: ${formatEther(inj)} INJ · ${formatUnits(usdc, 6)} USDC\n`);

const INJ_EACH = parseEther("0.12");
const USDC_CLOUD_AGENT = parseUnits("2.5", 6);
if (inj < INJ_EACH * 2n + parseEther("0.01")) throw new Error("funder INJ too low to provision cloud pair");
if (usdc < USDC_CLOUD_AGENT) throw new Error("funder USDC too low");

const cloudAgentKey = generatePrivateKey();
const cloudForgeKey = generatePrivateKey();
const cloudAgent = privateKeyToAccount(cloudAgentKey);
const cloudForge = privateKeyToAccount(cloudForgeKey);

async function send(desc, fn) {
  const hash = await fn();
  for (let i = 0; i < 20; i++) {
    const r = await pub.getTransactionReceipt({ hash }).catch(() => null);
    if (r) { console.log(`${desc}: ${hash} (${r.status})`); return; }
    await new Promise((s) => setTimeout(s, 3000));
  }
  console.log(`${desc}: ${hash} (broadcast — confirm on explorer)`);
}

await send(`0.12 INJ → cloud-agent`, () => wallet.sendTransaction({ to: cloudAgent.address, value: INJ_EACH }));
await send(`0.12 INJ → cloud-forge`, () => wallet.sendTransaction({ to: cloudForge.address, value: INJ_EACH }));
await send(`2.5 USDC → cloud-agent`, () =>
  wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [cloudAgent.address, USDC_CLOUD_AGENT] }));

console.log(`
── PASTE INTO RENDER ──────────────────────────────────────────
striker-agent → AGENT_PRIVATE_KEY=${cloudAgentKey}
striker-forge → FORGE_PRIVATE_KEY=${cloudForgeKey}
(both services → STRIKER_MODE=live — already set via render.yaml sync)

cloud-agent address: ${cloudAgent.address}
cloud-forge address: ${cloudForge.address}
───────────────────────────────────────────────────────────────`);

// Splits the agent wallet's testnet INJ + USDC with the forge wallet, so one
// faucet claim funds both facilitators. Injective EVM testnet (1439).
// Usage: node scripts/fund-forge.mjs
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "dotenv";
config();

const RPC = "https://k8s.testnet.json-rpc.injective.network";
const USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
const chain = {
  id: 1439,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const agent = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const forge = privateKeyToAccount(process.env.FORGE_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: agent, chain, transport: http(RPC) });

const [inj, usdc] = await Promise.all([
  pub.getBalance({ address: agent.address }),
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [agent.address] }),
]);
console.log(`agent ${agent.address}: ${formatEther(inj)} INJ · ${formatUnits(usdc, 6)} USDC`);

if (inj < parseEther("0.02")) {
  console.error("agent has too little INJ to split — fund it first");
  process.exit(1);
}

const injSend = inj / 2n - parseEther("0.005"); // keep gas headroom on the sender
const usdcSend = usdc / 2n;

const tx1 = await wallet.sendTransaction({ to: forge.address, value: injSend });
await pub.waitForTransactionReceipt({ hash: tx1 });
console.log(`sent ${formatEther(injSend)} INJ → forge: ${tx1}`);

if (usdcSend > 0n) {
  const tx2 = await wallet.writeContract({
    address: USDC, abi: erc20Abi, functionName: "transfer", args: [forge.address, usdcSend],
  });
  await pub.waitForTransactionReceipt({ hash: tx2 });
  console.log(`sent ${formatUnits(usdcSend, 6)} USDC → forge: ${tx2}`);
}

const [fInj, fUsdc] = await Promise.all([
  pub.getBalance({ address: forge.address }),
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [forge.address] }),
]);
console.log(`forge ${forge.address}: ${formatEther(fInj)} INJ · ${formatUnits(fUsdc, 6)} USDC`);
console.log("explorer: https://testnet.blockscout.injective.network/address/" + forge.address);

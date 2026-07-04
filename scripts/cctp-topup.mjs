// Real CCTP v2 transfer: burn USDC on Ethereum Sepolia (domain 0), fetch the
// Circle attestation, mint native USDC on Injective EVM testnet (domain 29)
// to STRIKER's agent wallet.
//
// Usage: node scripts/cctp-topup.mjs [amountUsdc]   (default 10)
// Needs: CCTP_RESERVE_PRIVATE_KEY with Sepolia ETH (gas) + USDC,
//        AGENT_PRIVATE_KEY with INJ on 1439 (gas for the mint).
import {
  createPublicClient, createWalletClient, erc20Abi, formatUnits, http,
  pad, parseAbi, parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "dotenv";
config();

const AMOUNT = parseUnits(process.argv[2] ?? "10", 6);
const SRC_RPC = process.env.CCTP_SOURCE_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DST_RPC = "https://k8s.testnet.json-rpc.injective.network";
const SRC_USDC = process.env.CCTP_SOURCE_USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const TOKEN_MESSENGER = process.env.CCTP_TOKEN_MESSENGER ?? "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const MESSAGE_TRANSMITTER = process.env.CCTP_DEST_TRANSMITTER ?? "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const SRC_DOMAIN = 0;   // Ethereum Sepolia
const DST_DOMAIN = 29;  // Injective (Circle supported-domains table)
const IRIS = "https://iris-api-sandbox.circle.com";

const messengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)",
]);
const transmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
]);

const reserve = privateKeyToAccount(process.env.CCTP_RESERVE_PRIVATE_KEY);
const agent = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const srcChain = { id: 11155111, name: "Sepolia", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [SRC_RPC] } } };
const dstChain = { id: 1439, name: "Injective EVM Testnet", nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 }, rpcUrls: { default: { http: [DST_RPC] } } };

const srcPub = createPublicClient({ chain: srcChain, transport: http(SRC_RPC) });
const srcWallet = createWalletClient({ account: reserve, chain: srcChain, transport: http(SRC_RPC) });
const dstPub = createPublicClient({ chain: dstChain, transport: http(DST_RPC) });
const dstWallet = createWalletClient({ account: agent, chain: dstChain, transport: http(DST_RPC) });

console.log(`burning ${formatUnits(AMOUNT, 6)} USDC on Sepolia → minting to ${agent.address} on Injective (domain ${DST_DOMAIN})`);

// 1. approve + burn on Sepolia
const approveTx = await srcWallet.writeContract({
  address: SRC_USDC, abi: erc20Abi, functionName: "approve", args: [TOKEN_MESSENGER, AMOUNT],
});
await srcPub.waitForTransactionReceipt({ hash: approveTx, timeout: 120_000 });
console.log(`approved: ${approveTx}`);

const burnTx = await srcWallet.writeContract({
  address: TOKEN_MESSENGER,
  abi: messengerAbi,
  functionName: "depositForBurn",
  args: [
    AMOUNT,
    DST_DOMAIN,
    pad(agent.address, { size: 32 }),
    SRC_USDC,
    pad("0x0000000000000000000000000000000000000000", { size: 32 }), // any relayer
    AMOUNT / 500n, // maxFee ≤ 0.2% (Fast Transfer)
    1000,          // minFinalityThreshold: fast
  ],
});
await srcPub.waitForTransactionReceipt({ hash: burnTx, timeout: 180_000 });
console.log(`burned:   ${burnTx}`);
console.log(`          https://sepolia.etherscan.io/tx/${burnTx}`);

// 2. poll Circle Iris for the attestation
console.log("waiting for Circle attestation…");
let message, attestation;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await fetch(`${IRIS}/v2/messages/${SRC_DOMAIN}?transactionHash=${burnTx}`);
  if (!res.ok) continue;
  const body = await res.json();
  const msg = body.messages?.[0];
  if (msg?.status === "complete") { message = msg.message; attestation = msg.attestation; break; }
  process.stdout.write(`  attempt ${i + 1}: ${msg?.status ?? "pending"}\r`);
}
if (!message) throw new Error("attestation not ready after 5 minutes — rerun later; the burn is safe");
console.log("\nattestation received ✓");

// 3. mint on Injective
const mintTx = await dstWallet.writeContract({
  address: MESSAGE_TRANSMITTER, abi: transmitterAbi, functionName: "receiveMessage",
  args: [message, attestation],
});
await dstPub.waitForTransactionReceipt({ hash: mintTx, timeout: 120_000 });
console.log(`minted:   ${mintTx}`);
console.log(`          https://testnet.blockscout.injective.network/tx/${mintTx}`);

const INJ_USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
const bal = await dstPub.readContract({ address: INJ_USDC, abi: erc20Abi, functionName: "balanceOf", args: [agent.address] });
console.log(`agent USDC on Injective: ${formatUnits(bal, 6)}`);

/**
 * STRIKER's wallet on Injective EVM testnet (chain 1439).
 * Live mode reads real USDC + INJ balances over RPC; sim mode maintains a
 * virtual bankroll driven by the ledger.
 */
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getRpcUrl, getToken, getViemChain } from "@injectivelabs/x402/networks";
import type { Address, Hex } from "viem";
import { CONFIG } from "./config.ts";
import { totals } from "./ledger.ts";

const key: Hex = CONFIG.agentPrivateKey ?? generatePrivateKey();
export const account = privateKeyToAccount(key);
export const privateKey = key;

const usdc = getToken(CONFIG.network, "USDC");
const client = createPublicClient({
  chain: getViemChain(CONFIG.network),
  transport: http(CONFIG.rpcUrl ?? getRpcUrl(CONFIG.network)),
});

export interface Balances {
  address: Address;
  usdcBalance: number;
  injBalance: number;
  mode: "live" | "sim";
  network: string;
}

let lastKnown: Balances | undefined;

export async function getBalances(): Promise<Balances> {
  if (CONFIG.mode === "live" && usdc) {
    try {
      const [usdcRaw, injRaw] = await Promise.all([
        client.readContract({
          address: usdc.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        }),
        client.getBalance({ address: account.address }),
      ]);
      lastKnown = {
        address: account.address,
        usdcBalance: Number(formatUnits(usdcRaw, usdc.decimals)),
        injBalance: Number(formatEther(injRaw)),
        mode: "live",
        network: CONFIG.network,
      };
      return lastKnown;
    } catch (err) {
      // transient RPC failure: serve the last on-chain read instead of throwing
      if (lastKnown) return lastKnown;
      throw err;
    }
  }
  const book = totals();
  return {
    address: account.address,
    usdcBalance: Number(
      (CONFIG.simOpeningBankUsdc + book.earnedUsdc + book.toppedUpUsdc - book.spentUsdc).toFixed(6),
    ),
    injBalance: 0,
    mode: "sim",
    network: CONFIG.network,
  };
}

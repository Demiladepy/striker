/**
 * Treasury policy: keep STRIKER solvent without a human.
 * When the Injective USDC balance drops below the floor, pull a CCTP top-up
 * from the reserve chain. One in-flight top-up at a time.
 */
import { CONFIG } from "./config.ts";
import { topUpViaCctp, type TopupResult } from "./cctp.ts";
import { record } from "./ledger.ts";
import { usdcToMicro } from "@striker/x402kit";
import type { Balances } from "./wallet.ts";

export interface TreasuryState {
  floorUsdc: number;
  topupUsdc: number;
  inFlight: TopupResult | undefined;
  history: TopupResult[];
}

const state: TreasuryState = {
  floorUsdc: CONFIG.treasury.floorUsdc,
  topupUsdc: CONFIG.treasury.topupUsdc,
  inFlight: undefined,
  history: [],
};

export function treasuryState(): TreasuryState {
  return state;
}

export async function checkTreasury(balances: Balances): Promise<void> {
  if (state.inFlight || balances.usdcBalance >= state.floorUsdc) return;
  if (CONFIG.mode === "live" && (!CONFIG.treasury.reserveKey || CONFIG.treasury.destDomain === undefined)) {
    return; // live without CCTP config: stay quiet, ledger shows the drain
  }
  console.log(
    `[treasury] balance ${balances.usdcBalance.toFixed(2)} USDC < floor ${state.floorUsdc} — firing CCTP top-up of ${state.topupUsdc} USDC`,
  );
  try {
    state.inFlight = await topUpViaCctp(balances.address, state.topupUsdc, (minted) => {
      state.inFlight = undefined;
      state.history = [minted, ...state.history].slice(0, 10);
      record({
        ts: Date.now(),
        kind: "topup",
        amountMicro: usdcToMicro(minted.amountUsdc),
        counterparty: minted.sourceChain,
        purpose: `CCTP v2 top-up minted on Injective (burn ${minted.burnTxHash.slice(0, 14)}…)`,
        txHash: minted.burnTxHash,
        network: CONFIG.network,
        simulated: minted.simulated,
      });
    });
  } catch (err) {
    state.inFlight = undefined;
    console.error(`[treasury] CCTP top-up failed: ${String(err)}`);
  }
}

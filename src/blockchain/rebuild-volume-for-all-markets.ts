import BigNumber from "bignumber.js";
import * as Knex from "knex";
import { postProcessDatabaseResults } from "../server/post-process-database-results";
import { Address, MarketsRow, TradesRow } from "../types";
import { volumeForTrade } from "./log-processors/order-filled/update-volumetrics";

export interface RebuildVolumeOpts {
  manualPostProcessDatabaseResults: boolean; // iff true, data load will run postProcessDatabaseResults() "manually", instead of relying on Knex to have postProcessResponse set to augur-node's postProcessDatabaseResults.
}

export interface RebuildVolumeResult {
  volumeInEthByMarketId: Map<Address, BigNumber>;
  volumeInEthByOutcomeByMarketId: Map<Address, Map<number, BigNumber>>;
}

type RebuildVolumeMarketsRow = Pick<MarketsRow<BigNumber>, "marketId" | "minPrice" | "maxPrice">;
type RebuildVolumeTradesRow = Pick<TradesRow<BigNumber>, "marketId" | "outcome" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">;

// rebuildVolumeForAllMarkets will update all markets.volume
// and outcomes.volume by computing the volume from scratch
// (non-incrementally) using the log data stored in trades table.
export async function rebuildVolumeForAllMarkets(db: Knex, opts: RebuildVolumeOpts): Promise<void> {
  const params = await getDataForCalculateVolumeForAllMarkets(db, opts);
  const newVolumeOrErr = calculateVolumeForAllMarkets(params.allMarkets, params.allTrades);
  if (newVolumeOrErr instanceof Error) {
    throw newVolumeOrErr;
  }
  await updateDBWithVolumeForAllMarkets(db, newVolumeOrErr);
}

// calculateVolumeForAllMarkets calculates each market and outcome's volume
// from scratch (non-incrementally) for the passed markets and trades. Typically
// a client would just use rebuildVolumeForAllMarkets() which wraps this. But
// you may want to use this eg. for unit testing, to show that `incremental
// volume calculation for N trades` == `non-incremental volume calculation`.
function calculateVolumeForAllMarkets(allMarkets: Array<RebuildVolumeMarketsRow>, allTrades: Array<RebuildVolumeTradesRow>): RebuildVolumeResult | Error {
  const marketsById: Map<Address, RebuildVolumeMarketsRow> = new Map();
  allMarkets.forEach((m) => marketsById.set(m.marketId, m));
  const volumeInEthByMarketId: Map<Address, BigNumber> = new Map();
  const volumeInEthByOutcomeByMarketId: Map<Address, Map<number, BigNumber>> = new Map();
  for (const tradesRow of allTrades) {
    const marketsRow = marketsById.get(tradesRow.marketId);
    if (marketsRow === undefined) {
      return new Error(`marketId not found ${tradesRow.marketId}`);
    }

    const volumeFromThisTrade = volumeForTrade({
      marketMinPrice: marketsRow.minPrice,
      marketMaxPrice: marketsRow.maxPrice,
      numCreatorTokens: tradesRow.numCreatorTokens,
      numCreatorShares: tradesRow.numCreatorShares,
      numFillerTokens: tradesRow.numFillerTokens,
      numFillerShares: tradesRow.numFillerShares,
    });

    // 1. Update markets.volume with volume from this trade
    const marketVolume = volumeInEthByMarketId.get(tradesRow.marketId);
    if (marketVolume === undefined) {
      volumeInEthByMarketId.set(tradesRow.marketId, volumeFromThisTrade);
    } else {
      volumeInEthByMarketId.set(tradesRow.marketId, marketVolume.plus(volumeFromThisTrade));
    }

    // 2. Update outcomes.volume with volume from this trade
    let volumeInEthByOutcome = volumeInEthByOutcomeByMarketId.get(tradesRow.marketId);
    if (volumeInEthByOutcome === undefined) {
      volumeInEthByOutcome = new Map();
      volumeInEthByOutcomeByMarketId.set(tradesRow.marketId, volumeInEthByOutcome);
    }
    const outcomeVolume = volumeInEthByOutcome.get(tradesRow.outcome);
    if (outcomeVolume === undefined) {
      volumeInEthByOutcome.set(tradesRow.outcome, volumeFromThisTrade);
    } else {
      volumeInEthByOutcome.set(tradesRow.outcome, outcomeVolume.plus(volumeFromThisTrade));
    }
  }

  return {
    volumeInEthByMarketId,
    volumeInEthByOutcomeByMarketId,
  };
}

async function getDataForCalculateVolumeForAllMarkets(db: Knex, opts: RebuildVolumeOpts): Promise<{
  allMarkets: Array<RebuildVolumeMarketsRow>,
  allTrades: Array<RebuildVolumeTradesRow>,
}> {
  // Why opts.manualPostProcessDatabaseResults? our DB layer converts whitelisted
  // fields automatically via postProcessDatabaseResults(), but Knex may be
  // passed from a context where this isn't setup (such as in a DB migration).
  const allMarkets: Array<RebuildVolumeMarketsRow> = await db.select("marketId", "minPrice", "maxPrice").from("markets").then((result) => opts.manualPostProcessDatabaseResults ? postProcessDatabaseResults(result) : result);
  const allTrades: Array<RebuildVolumeTradesRow> = await db.select("marketId", "outcome", "numCreatorTokens", "numCreatorShares", "numFillerTokens", "numFillerShares").from("trades").then((result) => opts.manualPostProcessDatabaseResults ? postProcessDatabaseResults(result) : result);
  return {
    allMarkets,
    allTrades,
  };
}

// updateDBWithVolumeForAllMarkets updates passed
// db with result of calculateVolumeForAllMarkets().
async function updateDBWithVolumeForAllMarkets(db: Knex, v: RebuildVolumeResult): Promise<void> {
  v.volumeInEthByMarketId.forEach(async (volumeInEth: BigNumber, marketId: Address) => await db("markets").update("volume", volumeInEth.toString()).where({ marketId }));

  v.volumeInEthByOutcomeByMarketId.forEach(async (volumeInEthByOutcome: Map<number, BigNumber>, marketId: Address) => {
    volumeInEthByOutcome.forEach(async (volumeInEth: BigNumber, outcome: number) => await db("outcomes").update("volume", volumeInEth.toString()).where({ marketId, outcome }));
  });
}

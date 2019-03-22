import * as t from "io-ts";
import * as Knex from "knex";
import Augur from "augur.js";
import { BigNumber } from "bignumber.js";

export interface PlatformActivityResult {
  activeUsers: BigNumber;
  numberOfTrades: BigNumber;
  openInterest: BigNumber;
  marketsCreated: BigNumber;
  volume: BigNumber;
  moneyAtStake: BigNumber;
}

export const PlatformActivityStatsParams = t.type({
  universe: t.string,
  endTime: t.union([t.number, t.null]),
  startTime: t.union([t.number, t.null]),
});
export type PlatformActivityStatsParamsType = t.TypeOf<typeof PlatformActivityStatsParams>;

export async function getPlatformActivityStats(db: Knex, augur: Augur, params: PlatformActivityStatsParamsType): Promise<PlatformActivityResult> {
  // trades is just in the trades table
  // openInterest comes from markets or categories
  // marketsCreated comes from markets
  // volume (markets has this already)
  // moneyAtStake ???
  const result: PlatformActivityResult = {
    activeUsers: new BigNumber(12, 10),
    numberOfTrades: new BigNumber(13, 10),
    openInterest: new BigNumber(14, 10),
    marketsCreated: new BigNumber(15, 10),
    volume: new BigNumber(16, 10),
    moneyAtStake: new BigNumber(17, 10),
  };

  return result;
}

import * as t from "io-ts";
import * as Knex from "knex";
import Augur from "augur.js";

export interface AccountTimeRangeResult {
  positions: number;
  marketsCreated: number;
  numberOfTrades: number;
  successfulDisputes: number;
  marketsTraded: number;
  redeemedPositions: number;
}

export const AccountTimeRangedStatsParams = t.type({
  universe: t.string,
  account: t.string,
  endTime: t.union([t.number, t.null]),
});
export type AccountTimeRangedStatsParamsType = t.TypeOf<typeof AccountTimeRangedStatsParams>;

export async function getAccountTimeRangedStats(db: Knex, augur: Augur, params: AccountTimeRangedStatsParamsType): Promise<AccountTimeRangeResult> {
  const result: AccountTimeRangeResult = {
    positions: 12,
    marketsCreated: 13,
    numberOfTrades: 14,
    successfulDisputes: 15,
    marketsTraded: 16,
    redeemedPositions: 17,
  };

  return new Promise<AccountTimeRangeResult>((resolve, reject) => {
    resolve(result);
  });
}

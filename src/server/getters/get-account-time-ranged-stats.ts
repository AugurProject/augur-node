import * as t from "io-ts";
import * as Knex from "knex";
import Augur from "augur.js";
import { blockNumberForTimestampQuery } from "./database";

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
  startTime: t.union([t.number, t.null]),
});
export type AccountTimeRangedStatsParamsType = t.TypeOf<typeof AccountTimeRangedStatsParams>;

export async function getAccountTimeRangedStats(db: Knex, augur: Augur, params: AccountTimeRangedStatsParamsType): Promise<AccountTimeRangeResult> {
  //
  // positions ... count share tokens in markets...look at database.ts
  // successfulDisputes ... read ticket
  //
  const sql = db.count("markets.marketId as marketsCreated")
    .count("trades.transactionhash as trades")
    .countDistinct("trades.marketId as maketsTraded")
    .count("proceeds.marketId as redeemedPositions")
    .from(db.raw(blockNumberForTimestampQuery(db, params.startTime || 0, "start").toString()).wrap("(", ")"))
    .join(db.raw(blockNumberForTimestampQuery(db, params.endTime || 0, "end").toString()).wrap("(", ")"))
    .leftJoin(db.raw("markets on universe = ? and markets.creationBlockNumber between startBlock and endBock",
      [params.universe]))
    .leftJoin(db.raw("trades as trades on (creator=? or filler=?) and (trades.blockNumber between startBlock and endblock) AND trades.marketId in (select markets.marketId from markets where universe=?)",
      [params.account, params.account, params.universe]))
    .leftJoin(db.raw("trading_proceeds as proceeds on account=? and (proceeds.blockNumber between startBlock and endBlock) and proceeds.marketId in (select markets.marketId from markets where universe=?)",
      [params.account, params.universe]));

  debugger;

  const result: AccountTimeRangeResult = {
    positions: 12,
    marketsCreated: 13,
    numberOfTrades: 14,
    successfulDisputes: 15,
    marketsTraded: 16,
    redeemedPositions: 17,
  };

  return result;
}

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

async function getPositions(db: Knex, startBlock: number, endBlock: number, params: AccountTimeRangedStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .count("tokens.outcome as positions")
    .from("balances")
    .innerJoin("tokens", "tokens.contractAddress", "balances.token")
    .innerJoin("markets", "tokens.marketId", "markets.marketId")
    .whereNotNull("tokens.marketId")
    .whereNotNull("tokens.outcome")
    .andWhere("balances.owner", params.account)
    .andWhere("markets.universe", params.universe)
    .whereBetween("markets.creationBlockNumber", [startBlock, endBlock]);
}

async function getSuccessfulDisputes(db: Knex, startBlock: number, endBlock: number, params: AccountTimeRangedStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .countDistinct("markets.marketId as successfulDisputes")
    .from("disputes")
    .innerJoin("crowdsourcers", "disputes.crowdsourcerId", "crowdsourcers.crowdsourcerId")
    .innerJoin("markets", "markets.marketId", "crowdsourcers.marketId")
    .innerJoin("payouts", "crowdsourcers.payoutId", "payouts.payoutId")
    .where("disputes.reporter", params.account)
    .andWhere("crowdsourcers.completed", true)
    .andWhere("payouts.winning", true)
    .whereBetween("markets.creationBlockNumber", [startBlock, endBlock]);
}

export async function getAccountTimeRangedStats(db: Knex, augur: Augur, params: AccountTimeRangedStatsParamsType): Promise<AccountTimeRangeResult> {
  // guards
  if (params.startTime && params.endTime && params.startTime > params.endTime)
    throw new Error("startTime must be less than or equal to endTime");
  if (!params.startTime) params.startTime = 0;
  if (!params.endTime) params.endTime = 0;

  // collates stats from several joins unrelated except by blockNumbers
  const sql = db.select(["startBlock", "endBlock"])
    .countDistinct("markets.marketId as marketsCreated")
    .countDistinct("trades.transactionhash as numberOfTrades")
    .countDistinct("trades.marketId as marketsTraded")
    .countDistinct("proceeds.marketId as redeemedPositions")
    .from(db.raw(blockNumberForTimestampQuery(db, params.startTime || 0, "start").toString()).wrap("(", ")"))
    .join(db.raw(blockNumberForTimestampQuery(db, params.endTime || 0, "end").toString()).wrap("(", ")"))
    .leftJoin(db.raw("markets on universe=? and markets.marketCreator=? and markets.creationBlockNumber between startBlock and endBlock",
      [params.universe, params.account]))
    .leftJoin(db.raw("trades as trades on (creator=? or filler=?) and (trades.blockNumber between startBlock and endblock) AND trades.marketId in (select markets.marketId from markets where universe=?)",
      [params.account, params.account, params.universe]))
    .leftJoin(db.raw("trading_proceeds as proceeds on account=? and (proceeds.blockNumber between startBlock and endBlock) and proceeds.marketId in (select markets.marketId from markets where universe=?)",
      [params.account, params.universe]));

  const res = (await sql).shift();

  const startBlock = res.startBlock;
  const endBlock = res.endBlock;
  const marketsCreated = res.marketsCreated;
  const numberOfTrades = res.numberOfTrades;
  const marketsTraded = res.marketsTraded;
  const redeemedPositions = res.redeemedPositions;

  if (!startBlock || !endBlock || startBlock > endBlock)
    throw new Error("startTime/endTime error");

  // Positions and successfulDisputes must be in a separate queries because they kill sqlLite3 otherwise.
  const positionsResult = (await getPositions(db, startBlock, endBlock, params)).shift();
  const positions = positionsResult.positions;

  const successfulDisputesResult = (await getSuccessfulDisputes(db, startBlock, endBlock, params)).shift();
  const successfulDisputes = successfulDisputesResult.successfulDisputes;

  const result: AccountTimeRangeResult = {
    positions,
    marketsCreated,
    numberOfTrades,
    successfulDisputes,
    marketsTraded,
    redeemedPositions,
  };

  return result;
}

import * as t from "io-ts";
import * as Knex from "knex";
import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import { blockNumberForTimestampQuery } from "./database";

interface VolumeRow<BigNumberType> {
  volume: BigNumberType;
}

interface StakedRow<BigNumberType> {
  amountStaked: BigNumberType;
}

export interface PlatformActivityResult {
  activeUsers: BigNumber;
  numberOfTrades: BigNumber;
  openInterest: BigNumber;
  marketsCreated: BigNumber;
  volume: BigNumber;
  amountStaked: BigNumber;
  disputedMarkets: BigNumber;
}

export const PlatformActivityStatsParams = t.type({
  universe: t.string,
  endTime: t.union([t.number, t.null]),
  startTime: t.union([t.number, t.null]),
});
export type PlatformActivityStatsParamsType = t.TypeOf<typeof PlatformActivityStatsParams>;

async function getVolume(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .select("amount as volume")
    .from("trades")
    .innerJoin("markets", "markets.marketId", "trades.marketId")
    .whereBetween("trades.blockNumber", [startBlock, endBlock])
    .andWhere("markets.universe", params.universe);
}

async function getAmountStaked(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .select(["disputes.amountStaked"])
    .from("disputes")
    .innerJoin("crowdsourcers", "disputes.crowdsourcerId", "crowdsourcers.crowdsourcerId")
    .whereBetween("disputes.blockNumber", [startBlock, endBlock])
    .whereIn("crowdsourcers.marketId", function(this: Knex.QueryBuilder) {
      this.select("markets.marketId")
        .from("markets")
        .where("universe", params.universe);
    });
}

async function getActiveUsers(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .countDistinct("account as activeUsers")
    .from(function(this: Knex.QueryBuilder) {
      this.select("filler as account").from("trades")
        .whereBetween("trades.blockNumber", [startBlock, endBlock])
        .whereIn("trades.marketId", function(this: Knex.QueryBuilder) {
          this.select("markets.marketId")
            .from("markets")
            .where("universe", params.universe);
        })
        .union(function(this: Knex.QueryBuilder) {
          this.select("filler as account").from("trades")
            .whereBetween("trades.blockNumber", [startBlock, endBlock])
            .whereIn("trades.marketId", function(this: Knex.QueryBuilder) {
              this.select("markets.marketId")
                .from("markets")
                .where("universe", params.universe);
            });
        })
        .union(function(this: Knex.QueryBuilder) {
          this.select("reporter as account")
            .from("disputes")
            .innerJoin("crowdsourcers", "disputes.crowdsourcerId", "crowdsourcers.crowdsourcerId")
            .whereBetween("disputes.blockNumber", [startBlock, endBlock])
            .whereIn("crowdsourcers.marketid", function(this: Knex.QueryBuilder) {
              this.select("markets.marketId")
                .from("markets")
                .where("universe", params.universe);
            });
        });
    });
}

async function getDisputedMarkets(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .countDistinct("markets.marketId as disputedMarkets")
    .from("markets")
    .innerJoin("market_state", "markets.marketId", "market_state.marketId")
    .whereBetween("markets.creationBlockNumber", [startBlock, endBlock])
    .andWhere("markets.universe", params.universe)
    .andWhere("market_state.reportingState", "CROWDSOURCING_DISPUTE");
}

async function getNumberOfTrades(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  return db
    .countDistinct("trades.transactionHash as numberOfTrades")
    .from("trades")
    .whereBetween("trades.blockNumber", [startBlock, endBlock])
    .whereIn("trades.marketId", function(this: Knex.QueryBuilder) {
      this.select("markets.marketId")
        .from("markets")
        .where("markets.universe", params.universe);
    });
}

export async function getPlatformActivityStats(db: Knex, augur: Augur, params: PlatformActivityStatsParamsType): Promise<PlatformActivityResult> {
  // guards
  if (params.startTime && params.endTime && params.startTime > params.endTime)
    throw new Error("startTime must be less than or equal to endTime");
  if (!params.startTime) params.startTime = 0;
  if (!params.endTime) params.endTime = 0;

  // collates stats from several joins unrelated except by blockNumbers
  const sql = db.select(["startBlock", "endBlock"])
    .countDistinct("markets.marketId as marketsCreated")
    .from(db.raw(blockNumberForTimestampQuery(db, params.startTime, "start").toString()).wrap("(", ")"))
    .join(db.raw(blockNumberForTimestampQuery(db, params.endTime, "end").toString()).wrap("(", ")"))
    .leftJoin(db.raw("markets on universe = ? and markets.creationBlockNumber between startBlock and endBlock",
      [params.universe]));

  const res = (await sql).shift();

  const startBlock = res.startBlock;
  const endBlock = res.endBlock;
  const marketsCreated = res.marketsCreated;

  if (!startBlock || !endBlock || startBlock > endBlock)
    throw new Error("startTime/endTime error");

  const activeUsersPromise = await getActiveUsers(db, startBlock, endBlock, params);
  const volumePromise = await getVolume(db, startBlock, endBlock, params);
  const amountStakedPromise = await getAmountStaked(db, startBlock, endBlock, params);
  const openInterestPromise = await augur.api.Universe.getOpenInterestInAttoEth({});
  const disputedMarketsPromise = await getDisputedMarkets(db, startBlock, endBlock, params);
  const numberOfTradesPromise = await getNumberOfTrades(db, startBlock, endBlock, params);

  const [activeUsersValue, volumeRows, amountStakedRows, openInterest, disputedMarketsValue, numberOfTradesValue] = await Promise.all(
    [activeUsersPromise,
      volumePromise,
      amountStakedPromise,
      openInterestPromise,
      disputedMarketsPromise,
      numberOfTradesPromise,
    ]);

  const activeUsers = activeUsersValue.shift().activeUsers;
  const disputedMarkets = disputedMarketsValue.shift().disputedMarkets;
  const numberOfTrades = numberOfTradesValue.shift().numberOfTrades;

  let volume = 0;
  if (volumeRows && volumeRows.length) {
    volume = volumeRows.reduce((acc: VolumeRow<BigNumber>, cur: VolumeRow<BigNumber>) => {
      acc.volume = acc.volume.plus(cur.volume);
      return acc;
    }).volume;
  }

  let amountStaked = 0;
  if (amountStakedRows && amountStakedRows.length) {
    amountStaked = amountStakedRows.reduce((acc: StakedRow<BigNumber>, cur: StakedRow<BigNumber>) => {
      acc.amountStaked = acc.amountStaked.plus(cur.amountStaked);
      return acc;
    }).amountStaked;
  }

  const result: PlatformActivityResult = {
    activeUsers: new BigNumber(activeUsers, 10),
    numberOfTrades: new BigNumber(numberOfTrades, 10),
    openInterest: new BigNumber(openInterest, 10),
    marketsCreated: new BigNumber(marketsCreated, 10),
    volume: new BigNumber(volume, 10),
    amountStaked: new BigNumber(amountStaked, 10),
    disputedMarkets: new BigNumber(disputedMarkets, 10),
  };

  return result;
}

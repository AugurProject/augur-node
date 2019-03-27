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
}

export const PlatformActivityStatsParams = t.type({
  universe: t.string,
  endTime: t.union([t.number, t.null]),
  startTime: t.union([t.number, t.null]),
});
export type PlatformActivityStatsParamsType = t.TypeOf<typeof PlatformActivityStatsParams>;

async function getVolume(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  const query = db
    .select("volume")
    .from("markets")
    .where("universe", params.universe)
    .whereBetween("creationBlockNumber", [startBlock, endBlock]);

  console.log(query.toString());
  return query;
}

async function getAmountStaked(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  const query = db
    .select(["disputes.amountStaked"])
    .from("disputes")
    .innerJoin("crowdsourcers", "disputes.crowdsourcerId", "crowdsourcers.crowdsourcerId")
    .whereBetween("disputes.blockNumber", [startBlock, endBlock])
    .whereIn("crowdsourcers.marketId", function(this: Knex.QueryBuilder) {
      this.select("markets.marketId")
        .from("markets")
        .where("universe", params.universe);
    });

  return query;
}

async function getActiveUsers(db: Knex, startBlock: number, endBlock: number, params: PlatformActivityStatsParamsType): Promise<Knex.QueryBuilder> {
  const query = db
    .countDistinct("account as activeUsers")
    .from(function(this: Knex.QueryBuilder) {
      this.select("filler as account").from("trades")
        .whereBetween("trades.blockNumber", [startBlock, endBlock])
        .whereIn("trades.marketId", function(this: Knex.QueryBuilder) {
          this.select("markets.marketId")
            .from("markets")
            .where("universe", params.universe);
        });
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

  return query;
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
    .countDistinct("trades.transactionhash as numberOfTrades")
    .from(db.raw(blockNumberForTimestampQuery(db, params.startTime, "start").toString()).wrap("(", ")"))
    .join(db.raw(blockNumberForTimestampQuery(db, params.endTime, "end").toString()).wrap("(", ")"))
    .leftJoin(db.raw("markets on universe=? and markets.creationBlockNumber between startBlock and endBlock",
      [params.universe]))
    .leftJoin(db.raw("trades as trades on trades.blockNumber between startBlock and endblock AND trades.marketId in (select markets.marketId from markets where universe=?)",
      [params.universe]));

  const res = (await sql).shift();

  const startBlock = res.startBlock;
  const endBlock = res.endBlock;
  const marketsCreated = res.marketsCreated;
  const numberOfTrades = res.numberOfTrades;

  if (!startBlock || !endBlock || startBlock > endBlock)
    throw new Error("startTime/endTime error");

  const activeUsers = (await getActiveUsers(db, startBlock, endBlock, params)).shift();

  let volume = new BigNumber(0, 10);
  const volumeRows = await getVolume(db, startBlock, endBlock, params);
  if (volumeRows.length) {
    volume = volumeRows.reduce((acc: BigNumber, cur: VolumeRow<BigNumber>) => {
      acc.plus(cur.volume);
    });
  }

  let amountStaked = new BigNumber(0, 10);
  const amountStakedRows = await getAmountStaked(db, startBlock, endBlock, params);
  if (amountStakedRows.length) {
    const amountStaked = amountStakedRows.reduce((acc: BigNumber, cur: StakedRow<BigNumber>) => {
      acc.plus(cur.amountStaked);
    });
  }

  const openInterest = await augur.api.Universe.getOpenInterestInAttoEth({});

  debugger;

  const result: PlatformActivityResult = {
    activeUsers: new BigNumber(activeUsers, 10),
    numberOfTrades: new BigNumber(numberOfTrades, 10),
    openInterest: new BigNumber(openInterest, 10),
    marketsCreated: new BigNumber(marketsCreated, 10),
    volume: new BigNumber(volume, 10),
    amountStaked: new BigNumber(amountStaked, 10),
  };

  return result;
}

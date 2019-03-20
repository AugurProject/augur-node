import * as t from "io-ts";
import * as Knex from "knex";
import { Action, Address, Coin, SortLimitParams } from "../../types";
import { UserShareBalancesParams } from "./get-user-share-balances";
import { reject } from "bluebird";

export const GetAccountTransactionHistoryParams = t.intersection([
  SortLimitParams,
  t.type({
    universe: t.string,
    account: t.string,
    earliestTransactionTime: t.number,
    latestTransactionTime: t.number,
    coin: t.string,
    action: t.union([t.string, t.null, t.undefined]),
  }),
]);
type GetAccountTransactionHistoryParamsType = t.TypeOf<typeof GetAccountTransactionHistoryParams>;

function queryBuy(db: Knex, qb: Knex.QueryBuilder, account: Address, coin: string, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO
  return qb;
}

function querySell(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO
  return qb;
}

function queryClaim(db: Knex, qb: Knex.QueryBuilder, account: Address, coin: string, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO
  return qb;
}

function queryDispute(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO Add outcome name
  // TODO Filter by account
  // TODO Are costBasis, fee, & total correct?
  return qb.from("crowdsourcers")
    .select(
      db.raw("? as action", Action.DISPUTE), 
      db.raw("? as coin", "REP"), 
      db.raw("? as costBasis", "0"), 
      "crowdsourcers.amountStaked as fee", 
      "crowdsourcers.marketId",
      db.raw("? as outcome", ""),
      db.raw("? as quantity", 0),
      "crowdsourcers.amountStaked as total",
      "crowdsourcers.transactionHash")
    .where({
      // "crowdsourcers.reporter": account,
    });
}

function queryInitialReport(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO Add outcome name
  // TODO Get fee & total figured out
  return qb
    .from("initial_reports")
    .select(
      db.raw("? as action", Action.INITIAL_REPORT), 
      db.raw("? as coin", "REP"), 
      db.raw("? as costBasis", "0"), 
      "initial_reports.amountStaked as fee", 
      "initial_reports.marketId",
      db.raw("? as outcome", ""),
      db.raw("? as quantity", 0),
      "initial_reports.amountStaked as total",
      "initial_reports.transactionHash")
    .where({
      "initial_reports.reporter": account,
    });
}

function queryMarketCreation(db: Knex, qb: Knex.QueryBuilder, account: Address, coin: string, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO Optimize this code
  if (coin === Coin.ETH) {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("? as coin", "ETH"), db.raw("? as costBasis", "0"), "markets.validityBondSize as fee", "markets.marketId", db.raw("? as outcome", ""), db.raw("? as quantity", "0"), "markets.validityBondSize as total", "markets.transactionHash")
    .where({
      "markets.marketCreator": account,
    });
  } else if (coin === Coin.REP) {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("? as coin", "REP"), db.raw("? as costBasis", "0"), "markets.designatedReportStake as fee", "markets.marketId", db.raw("? as outcome", ""), db.raw("? as quantity", "0"), "markets.designatedReportStake as total", "markets.transactionHash")
    .where({
      "markets.marketCreator": account,
    });
  } else {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("? as coin", "ETH"), db.raw("? as costBasis", "0"), "markets.validityBondSize as fee", "markets.marketId", db.raw("? as outcome", ""), db.raw("? as quantity", "0"), "markets.validityBondSize as total", "markets.transactionHash")
    .where({
      "markets.marketCreator": account,
    })
    .union((qb: Knex.QueryBuilder) => {
      qb.from("markets")
      .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("? as coin", "REP"), db.raw("? as costBasis", "0"), "markets.designatedReportStake as fee", "markets.marketId", db.raw("? as outcome", ""), db.raw("? as quantity", "0"), "markets.designatedReportStake as total", "markets.transactionHash")
      .where({
        "markets.marketCreator": account,
      });
    });
  }
}

function queryCompleteSets(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TODO Get cost basis, fee, & total figured out
  return qb
    .from("completeSets")
    .select(
      db.raw("? as action", Action.COMPLETE_SETS),
      db.raw("? as coin", "ETH"),
      db.raw("? as costBasis", "0"),
      db.raw("? as fee", "0"),
      "completeSets.marketId", 
      db.raw("? as outcome", ""),
      "completeSets.numCompleteSets as quantity",
      "completeSets.numCompleteSets as total",
      "completeSets.transactionHash",
    )
    .where({
      "completeSets.account": account,
    });
}

export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  const getAccountTransactionHistoryResponse = await db.select("data.*", "markets.shortDescription", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    if (params.action === Action.BUY || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryBuy(db, qb, params.account, params.coin, params);
      })
    }
    if ((params.action === Action.SELL || params.action === Action.ALL) && params.coin === "ETH") {
      qb.union((qb: Knex.QueryBuilder) => {
        querySell(db, qb, params.account, params);
      })
    }
    if (params.action === Action.CLAIM || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaim(db, qb, params.account, params.coin, params);
      })
    }
    if (params.action === Action.MARKET_CREATION || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryMarketCreation(db, qb, params.account, params.coin, params);
      })
    }
    if ((params.action === Action.DISPUTE || params.action === Action.ALL) && params.coin === "REP") {
      qb.union((qb: Knex.QueryBuilder) => {
        queryDispute(db, qb, params.account, params);
      })
    }
    if ((params.action === Action.INITIAL_REPORT || params.action === Action.ALL) && params.coin === "REP") {
      qb.union((qb: Knex.QueryBuilder) => {
        queryInitialReport(db, qb, params.account, params);
      })
    }
    if ((params.action === Action.COMPLETE_SETS || params.action === Action.ALL) && params.coin === "ETH") {
      qb.union((qb: Knex.QueryBuilder) => {
        queryCompleteSets(db, qb, params.account, params);
      })
    }
    if (qb.toString() === "select *") {
      // TODO Handle invalid action/coin combination
    }
    qb.as("data");
  })
  .join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
  .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
  .join("markets", "markets.marketId", "data.marketId")
  .where({
    "markets.universe": params.universe,
  })
  .whereBetween("blocks.timestamp", [params.earliestTransactionTime, params.latestTransactionTime])
  .orderBy("blocks.timestamp", "desc");

  // TODO Enable use of SortLimitParams

  return getAccountTransactionHistoryResponse;
}

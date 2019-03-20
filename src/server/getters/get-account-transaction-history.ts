import * as t from "io-ts";
import * as Knex from "knex";
import { ActionType, Address, Denomination, SortLimitParams } from "../../types";
import { UserShareBalancesParams } from "./get-user-share-balances";

export const GetAccountTransactionHistoryParams = t.intersection([
  SortLimitParams,
  t.type({
    universe: t.string,
    account: t.string,
    earliestTransactionTime: t.number,
    latestTransactionTime: t.number,
    denomination: t.string,
    actionType: t.union([t.string, t.null, t.undefined]),
  }),
]);
type GetAccountTransactionHistoryParamsType = t.TypeOf<typeof GetAccountTransactionHistoryParams>;

function queryBuy(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

function querySell(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

function queryClaim(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

function queryDispute(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

function queryInitialReport(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

function queryMarketCreation(db: Knex, qb: Knex.QueryBuilder, account: Address, denomination: string, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  if (denomination === Denomination.ETH) {
    return qb.from("markets")
    .select(db.raw("? as outcome", ""), db.raw("? as action", "MARKET_CREATION"), "markets.marketCreator as account", "markets.marketId", "markets.transactionHash", db.raw("? as costBasis", "0"), db.raw("? as denomination", "ETH"), "markets.validityBondSize as fee", "markets.validityBondSize as total")
    .where({
      "markets.marketCreator": account,
    });
  } else if (denomination === Denomination.REP) {
    return qb.from("markets")
    .select(db.raw("? as outcome", ""), db.raw("? as action", "MARKET_CREATION"), "markets.marketCreator as account", "markets.marketId", "markets.transactionHash", db.raw("? as costBasis", "0"), db.raw("? as denomination", "REP"), "markets.designatedReportStake as fee", "markets.designatedReportStake as total")
    .where({
      "markets.marketCreator": account,
    });
  } else {
    return qb.from("markets")
      .select(db.raw("? as outcome", ""), db.raw("? as action", "MARKET_CREATION"), "markets.marketCreator as account", "markets.marketId", "markets.transactionHash", db.raw("? as costBasis", "0"), db.raw("? as denomination", "ETH"), "markets.validityBondSize as fee", "markets.validityBondSize as total")
      .where({
        "markets.marketCreator": account,
      })
      .union((qb: Knex.QueryBuilder) => {
        qb.from("markets")
          .select(db.raw("? as outcome", ""), db.raw("? as action", "MARKET_CREATION"), "markets.marketCreator as account", "markets.marketId", "markets.transactionHash", db.raw("? as costBasis", "0"), db.raw("? as denomination", "REP"), "markets.designatedReportStake as fee", "markets.designatedReportStake as total")
          .where({
            "markets.marketCreator": account,
          });
      });
  }
}

function queryCompleteSet(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  // TBD
}

export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  return await db.select("data.*", "markets.shortDescription", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    queryMarketCreation(db, qb, params.account, params.denomination, params)
    .as("data");
  })
  .join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
  .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
  .join("markets", "markets.marketId", "data.marketId")
    .where({
      "markets.universe": params.universe,
    })
    .whereBetween("blocks.timestamp", [params.earliestTransactionTime, params.latestTransactionTime])
    .orderBy("blocks.timestamp", "desc");

  if (params.actionType !== "all" && params.actionType !== null) {
    // TOOD Filter transactions by transactionType
  }
}

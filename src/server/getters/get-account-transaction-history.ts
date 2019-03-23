import * as t from "io-ts";
import * as Knex from "knex";
import { Action, Coin, SortLimitParams, UIAccountTransactionHistoryRow } from "../../types";
import { queryModifier } from "./database";

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

function queryBuy(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.BUY),
    db.raw("'ETH' as coin"),
    db.raw("'Buy order' as details"),
    db.raw("(CAST(trades.reporterFees as real) + CAST(trades.marketCreatorFees as real)) as fee"),
    "markets.shortDescription as marketDescription",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("trades.price as price"),
    db.raw("trades.amount as quantity"),
    db.raw("(CAST(trades.numCreatorShares as real) * (CAST(markets.maxPrice as real) - CAST(trades.price as real))) as total"),
    "trades.transactionHash")
  .from("trades")
  .join("markets", "markets.marketId", "trades.marketId")
  .join("outcomes", function () {
    this
      .on("outcomes.marketId", "trades.marketId")
      .on("outcomes.outcome", "trades.outcome");
  })
  .where({
    "trades.creator": params.account,
    "markets.universe": params.universe,
  });
}

function querySell(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.SELL),
    db.raw("'ETH' as coin"),
    db.raw("'Sell order' as details"),
    db.raw("(CAST(trades.reporterFees as real) + CAST(trades.marketCreatorFees as real)) as fee"),
    "markets.shortDescription as marketDescription",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("trades.price as price"),
    db.raw("trades.amount as quantity"),
    db.raw("(CAST(trades.numCreatorShares as real) * (CAST(trades.price as real) - CAST(trades.numCreatorTokens as real))) as total"),
    "trades.transactionHash")
  .from("trades")
  .join("markets", "markets.marketId", "trades.marketId")
  .join("outcomes", function () {
    this
      .on("outcomes.marketId", "trades.marketId")
      .on("outcomes.outcome", "trades.outcome");
  })
  .where({
    "trades.creator": params.account,
    "markets.universe": params.universe,
  });
}

function queryCanceled(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.CANCEL),
    db.raw("'ETH' as coin"),
    db.raw("'Canceled order' as details"),
    db.raw("'0' as fee"),
    "markets.shortDescription as marketDescription",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("'0' as price"),
    db.raw("orders.amount as quantity"),
    db.raw("'0' as total"),
    "orders_canceled.transactionHash")
  .from("orders_canceled")
  .join("markets", "markets.marketId", "orders.marketId")
  .join("orders", "orders.orderId", "orders_canceled.orderId")
  .join("outcomes", function () {
    this
      .on("outcomes.marketId", "orders.marketId")
      .on("outcomes.outcome", "orders.outcome");
  })
  .where({
    "orders.orderCreator": params.account,
    "markets.universe": params.universe,
  });
}

function queryClaim(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  if (params.coin === Coin.ETH || params.coin === Coin.ALL) {
    // Get reporting fees claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'ETH' as coin"),
        db.raw("'Claimed reporting fees from crowdsourcers' as details"),
        db.raw("'0' as fee"),
        "markets.shortDescription as marketDescription",
        db.raw("'' as outcomeDescription"),
        db.raw("'0' as price"),
        db.raw("'0' as quantity"),
        db.raw("crowdsourcer_redeemed.reportingFeesReceived as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe,
      });
    });

    // Get reporting fees claimed from participation tokens
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'ETH' as coin"),
        db.raw("'Claimed reporting fees from participation tokens' as details"),
        db.raw("'0' as fee"),
        db.raw("'' as marketDescription"),
        db.raw("'' as outcomeDescription"),
        db.raw("'0' as price"),
        db.raw("'0' as quantity"),
        db.raw("participation_token_redeemed.reportingFeesReceived as total"),
        "participation_token_redeemed.transactionHash")
      .from("participation_token_redeemed")
      .join("fee_windows", "fee_windows.feeWindow", "participation_token_redeemed.feeWindow")
      .where({
        "participation_token_redeemed.reporter": params.account,
        "fee_windows.universe": params.universe,
      });
    });

    // Get claimed trading proceeds
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'ETH' as coin"),
        db.raw("'Claimed trading proceeds' as details"),
        db.raw("((CAST(trading_proceeds.numShares as real) * CAST(outcomes.price as real)) - CAST(trading_proceeds.numPayoutTokens as real)) as fee"),
        db.raw("'' as marketDescription"),
        db.raw("outcomes.description as outcomeDescription"),
        db.raw("outcomes.price as price"),
        db.raw("trading_proceeds.numShares as quantity"),
        db.raw("trading_proceeds.numPayoutTokens as total"),
        "trading_proceeds.transactionHash")
      .from("trading_proceeds")
      .join("markets", "markets.marketId", "trading_proceeds.marketId")
      .join("tokens", "tokens.contractAddress", "trading_proceeds.shareToken")
      .join("outcomes", function () {
        this
          .on("outcomes.marketId", "tokens.marketId")
          .on("outcomes.outcome", "tokens.outcome");
      })
      .where({
        "trading_proceeds.account": params.account,
        "markets.universe": params.universe,
      });
    });

    // TODO Get ETH claimed from market creator mailbox (i.e., market creator fees & validity bonds)
    // once new code is added to allow querying for this info
  }

  if (params.coin === Coin.REP || params.coin === Coin.ALL) {
    // Get REP claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'REP' as coin"),
        db.raw("'Claimed REP fees from crowdsourcers' as details"),
        db.raw("'0' as fee"),
        "markets.shortDescription as marketDescription",
        db.raw("'' as outcomeDescription"),
        db.raw("'0' as price"),
        db.raw("'0' as quantity"),
        db.raw("crowdsourcer_redeemed.repReceived as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe,
      });
    });

    // TODO Get REP claimed from market creator mailbox (i.e., no-show bonds)
    // once new code is added to allow querying for this info
  }

  return qb;
}

function queryDispute(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get REP staked in dispute crowdsourcers
  return qb.select(
      db.raw("? as action", Action.DISPUTE), 
      db.raw("'REP' as coin"),
      db.raw("'REP staked in dispute crowdsourcers' as details"),
      db.raw("'0' as fee"),
      "markets.shortDescription as marketDescription", 
      db.raw("'' as outcomeDescription"),
      db.raw("'0' as price"),
      "disputes.amountStaked as quantity",
      db.raw("'0' as total"),
      "disputes.transactionHash")
    .from("disputes")
    .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "disputes.crowdsourcerId")
    .join("payouts", "payouts.payoutId", "crowdsourcers.payoutId")
    .join("markets", "markets.marketId", "crowdsourcers.marketId")
    .where({
      "disputes.reporter": params.account,
      "markets.universe": params.universe,
    });
}

function queryInitialReport(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get REP staked in initial reports
  return qb.select(
    db.raw("? as action", Action.INITIAL_REPORT), 
    db.raw("'REP' as coin"),
    db.raw("'REP staked in initial reports' as details"),
    db.raw("'0' as fee"),
    "markets.shortDescription as marketDescription", 
    db.raw("'' as outcomeDescription"), 
    db.raw("'0' as price"),
    "initial_reports.amountStaked as quantity",
    db.raw("'0' as total"),
    "initial_reports.transactionHash")
  .from("initial_reports")
  .join("payouts", "payouts.payoutId", "initial_reports.payoutId")
  .join("markets", "markets.marketId", "initial_reports.marketId")
  .where({
    "initial_reports.reporter": params.account,
    "markets.universe": params.universe,
  });
}

function queryMarketCreation(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.MARKET_CREATION), 
    db.raw("'ETH' as coin"), 
    db.raw("'ETH validity bond for market creation' as details"), 
    "markets.creationFee as fee", 
    "markets.shortDescription as marketDescription", 
    db.raw("'' as outcomeDescription"), 
    db.raw("'0' as price"), 
    db.raw("'0' as quantity"), 
    db.raw("'0' as total"), 
    "markets.transactionHash")
  .from("markets")
  .where({
    "markets.marketCreator": params.account,
    "markets.universe": params.universe,
  });
}

function queryCompleteSets(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get complete sets bought
  qb.union((qb: Knex.QueryBuilder) => {
    qb.select(
        db.raw("? as action", Action.COMPLETE_SETS),
        db.raw("'ETH' as coin"),
        db.raw("'Buy complete sets' as details"), 
        // db.raw("printf('%.18f', 0) as fee"),
        db.raw("'0' as fee"),
        "markets.shortDescription as marketDescription", 
        db.raw("'' as outcomeDescription"),
        "markets.numTicks as price",
        "completeSets.numCompleteSets as quantity",
        db.raw("'0' as total"),
        "completeSets.transactionHash")
      .from("completeSets")
      .join("markets", "markets.marketId", "completeSets.marketId")
      .where({
        "completeSets.account": params.account,
        "completeSets.eventName": "CompleteSetsPurchased",
        "markets.universe": params.universe,
      });
    });

  // Get complete sets sold
  // TODO Calculate fee (currently difficult to do in Augur Node)
  qb.union((qb: Knex.QueryBuilder) => {
    qb.select(
      db.raw("? as action", Action.COMPLETE_SETS),
      db.raw("'ETH' as coin"),
      db.raw("'Sell complete sets' as details"), 
      db.raw("'0' as fee"),
      "markets.shortDescription as marketDescription", 
      db.raw("'' as outcomeDescription"),
      "markets.numTicks as price",
      "completeSets.numCompleteSets as quantity",
      db.raw("'0' as total"),
      "completeSets.transactionHash")
    .from("completeSets")
    .join("markets", "markets.marketId", "completeSets.marketId")
    .where({
      "completeSets.account": params.account,
      "completeSets.eventName": "CompleteSetsSold",
      "markets.universe": params.universe,
    });
  });

  return qb;
}

// TODO Check formatting of values
// TODO Add payout numerators to all queries
// TODO Once all queries are finished, double-check them to make sure they all are filtering by universe
export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  params.account = params.account.toLowerCase();
  params.universe = params.universe.toLowerCase();

  const query = db.select("data.*", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    if ((params.action === Action.BUY || params.action === Action.ALL) && (params.coin === "ETH"|| params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryBuy(db, qb, params);
      });
    }
    if ((params.action === Action.SELL || params.action === Action.ALL) && (params.coin === "ETH"|| params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        querySell(db, qb, params);
      });
    }
    if ((params.action === Action.CANCEL || params.action === Action.ALL) && (params.coin === "ETH"|| params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryCanceled(db, qb, params);
      });
    }
    if (params.action === Action.CLAIM || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaim(db, qb, params);
      });
    }
    if ((params.action === Action.MARKET_CREATION || params.action === Action.ALL) && (params.coin === "ETH"|| params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryMarketCreation(db, qb, params);
      });
    }
    if ((params.action === Action.DISPUTE || params.action === Action.ALL) && (params.coin === "REP" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryDispute(db, qb, params);
      });
    }
    if ((params.action === Action.INITIAL_REPORT || params.action === Action.ALL) && (params.coin === "REP" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryInitialReport(db, qb, params);
      });
    }
    if ((params.action === Action.COMPLETE_SETS || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryCompleteSets(db, qb, params);
      });
    }
    if (qb.toString() === "select *") {
      // TODO Handle invalid action/coin combination
      console.log("Invalid action/coin combination");
    }
    qb.as("data");
  })
  .join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
  .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
  .whereBetween("blocks.timestamp", [params.earliestTransactionTime, params.latestTransactionTime]);

  const results = await queryModifier<UIAccountTransactionHistoryRow<BigNumber>>(db, query, "blocks.timestamp", "desc", params);

  return results;
}

import * as t from "io-ts";
import * as Knex from "knex";
import { Action, Address, Coin, SortLimitParams } from "../../types";

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
  // TODO Finish this once old PL code is re-added

  return qb;
}

function querySell(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // TODO Finish this once old PL code is re-added

  return qb;
}

function queryClaim(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  if (params.coin === Coin.ETH || params.coin === Coin.ALL) {
    // Get reporting fees claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'ETH' as coin"),
        db.raw("printf(\"%.18f\", 0) as costBasis"),
        db.raw("'Reporting fees claimed from winning crowdsourcers' as details"),
        db.raw("printf(\"%.18f\", 0) as fee"),
        "crowdsourcers.marketId",
        db.raw("'' as outcome"),
        db.raw("'' as outcomeDescription"),
        db.raw("printf(\"%.18f\", 0) as quantity"),
        "markets.shortDescription",
        db.raw("printf(\"%.18f\", CAST(crowdsourcer_redeemed.reportingFeesReceived as real)) as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe
      });
    });

    // Get reporting fees claimed from participation tokens
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'ETH' as coin"),
        db.raw("printf(\"%.18f\", 0) as costBasis"),
        db.raw("'Reporting fees claimed from participation tokens' as details"),
        db.raw("printf(\"%.18f\", 0) as fee"),
        db.raw("'' as marketId"),
        db.raw("'' as outcome"),
        db.raw("'' as outcomeDescription"),
        db.raw("printf(\"%.18f\", 0) as quantity"),
        db.raw("'' as shortDescription"),
        db.raw("printf(\"%.18f\", CAST(participation_token_redeemed.reportingFeesReceived as real)) as total"),
        "participation_token_redeemed.transactionHash")
      .from("participation_token_redeemed")
      .join("fee_windows", "fee_windows.feeWindow", "participation_token_redeemed.feeWindow")
      .where({
        "participation_token_redeemed.reporter": params.account,
        "fee_windows.universe": params.universe
      });
    });

    // Get ETH claimed from market creator mailbox (i.e., market creator fees & validity bonds)
    // TODO Finish this once new code is added to allow querying for this info

    // Get claimed trading proceeds
    // TODO Finish this once old PL code is re-added
  }

  if (params.coin === Coin.REP || params.coin === Coin.ALL) {
    // Get REP claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM),
        db.raw("'REP' as coin"),
        db.raw("printf(\"%.18f\", 0) as costBasis"),
        db.raw("'REP claimed from winning crowdsourcers' as details"),
        db.raw("printf(\"%.18f\", 0) as fee"),
        "crowdsourcers.marketId",
        db.raw("'' as outcome"),
        db.raw("'' as outcomeDescription"),
        db.raw("printf(\"%.18f\", 0) as quantity"),
        "markets.shortDescription",
        db.raw("printf(\"%.18f\", CAST(crowdsourcer_redeemed.repReceived as real)) as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe
      });
    });

    // Get REP claimed from market creator mailbox (i.e., no-show bonds)
    // TODO Finish this once new code is added to allow querying for this info
  }

  return qb;
}

function queryDispute(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get REP lost in losing dispute crowdsourcers
  return qb.select(
      db.raw("? as action", Action.DISPUTE), 
      db.raw("'REP' as coin"),
      db.raw("printf(\"%.18f\", 0) as costBasis"),
      db.raw("'REP lost in losing dispute crowdsourcers' as details"),
      db.raw("printf(\"%.18f\", 0) as fee"),
      "crowdsourcers.marketId",
      db.raw("'' as outcome"), 
      db.raw("'' as outcomeDescription"), 
      db.raw("printf(\"%.18f\", 0) as quantity"),
      "markets.shortDescription", 
      db.raw("printf(\"%.18f\", CAST(crowdsourcers.amountStaked as real) * -1) as total"),
      "disputes.transactionHash")
    .from("disputes")
    .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "disputes.crowdsourcerId")
    .join("payouts", "payouts.payoutId", "crowdsourcers.payoutId")
    .join("markets", "markets.marketId", "crowdsourcers.marketId")
    .where({
      "disputes.reporter": params.account,
      "markets.universe": params.universe,
      "payouts.winning": 0,
    });
}

function queryInitialReport(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get REP lost in initial reports where designated reporter reported
  return qb.select(
    db.raw("? as action", Action.INITIAL_REPORT), 
    db.raw("'REP' as coin"),
    db.raw("printf(\"%.18f\", 0) as costBasis"),
    db.raw("'Get REP lost in initial reports where designated reporter reported' as details"),
    db.raw("printf(\"%.18f\", 0) as fee"),
    "initial_reports.marketId",
    db.raw("'' as outcome"), 
    db.raw("'' as outcomeDescription"), 
    db.raw("printf(\"%.18f\", 0) as quantity"),
    "markets.shortDescription", 
    db.raw("printf(\"%.18f\", CAST(initial_reports.amountStaked as real) * -1) as total"),
    "initial_reports.transactionHash")
  .from("initial_reports")
  .join("payouts", "payouts.payoutId", "initial_reports.payoutId")
  .join("markets", "markets.marketId", "initial_reports.marketId")
  .where({
    "initial_reports.reporter": params.account,
    "initial_reports.isDesignatedReporter": 1,
    "markets.universe": params.universe,
    "payouts.winning": 0,
  });
}

function queryMarketCreation(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // TODO Modify this code to show gains/losses
  if (params.coin === Coin.ETH) {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("'ETH' as coin"), db.raw("printf('%.18f', 0) as costBasis"), db.raw("'ETH validity bond for market creation' as details"), "markets.validityBondSize as fee", "markets.marketId", db.raw("'' as outcome"), db.raw("'' as outcomeDescription"), db.raw("'' as quantity"), "markets.shortDescription", db.raw("printf(\"%.18f\", CAST(markets.validityBondSize as real)) as total"), "markets.transactionHash")
    .where({
      "markets.marketCreator": params.account,
      "markets.universe": params.universe,
    });
  } else if (params.coin === Coin.REP) {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("'REP' as coin"), db.raw("printf('%.18f', 0) as costBasis"), db.raw("'REP no-show bond for market creation' as details"), "markets.designatedReportStake as fee", "markets.marketId", db.raw("'' as outcome"), db.raw("'' as outcomeDescription"), db.raw("'' as quantity"), "markets.shortDescription", db.raw("printf(\"%.18f\", CAST(markets.designatedReportStake as real)) as total"), "markets.transactionHash")
    .where({
      "markets.marketCreator": params.account,
      "markets.universe": params.universe,
    });
  } else {
    return qb.from("markets")
    .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("'ETH' as coin"), db.raw("printf('%.18f', 0) as costBasis"), db.raw("'ETH validity bond for market creation' as details"), "markets.validityBondSize as fee", "markets.marketId", db.raw("'' as outcome"), db.raw("'' as outcomeDescription"), db.raw("'' as quantity"), "markets.shortDescription", db.raw("printf(\"%.18f\", CAST(markets.validityBondSize as real)) as total"), "markets.transactionHash")
    .where({
      "markets.marketCreator": params.account,
      "markets.universe": params.universe,
    })
    .union((qb: Knex.QueryBuilder) => {
      qb.from("markets")
      .select(db.raw("? as action", Action.MARKET_CREATION), db.raw("'REP' as coin"), db.raw("printf('%.18f', 0) as costBasis"), db.raw("'REP no-show bond for market creation' as details"), "markets.designatedReportStake as fee", "markets.marketId", db.raw("'' as outcome"), db.raw("'' as outcomeDescription"), db.raw("'' as quantity"), "markets.shortDescription", db.raw("printf(\"%.18f\", CAST(markets.designatedReportStake as real)) as total"), "markets.transactionHash")
      .where({
        "markets.marketCreator": params.account,
        "markets.universe": params.universe,
      });
    });
  }
}

function queryCompleteSets(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get complete sets bought
  qb.select(
      db.raw("? as action", Action.COMPLETE_SETS),
      db.raw("'ETH' as coin"),
      db.raw("printf('%.18f', 0) as costBasis"),
      db.raw("'Buy complete sets' as details"), 
      db.raw("printf('%.18f', 0) as fee"),
      "completeSets.marketId",
      db.raw("'' as outcome"),
      db.raw("'' as outcomeDescription"),
      "completeSets.numCompleteSets as quantity",
      "markets.shortDescription", 
      db.raw("printf(\"%.18f\", 0) as total"),
      "completeSets.transactionHash")
    .from("completeSets")
    .join("markets", "markets.marketId", "completeSets.marketId")
    .where({
      "completeSets.account": params.account,
      "completeSets.eventName": "CompleteSetsPurchased",
      "markets.universe": params.universe,
    });

    // Get complete sets sold
    // TODO Finish this once old PL code gets re-added
    console.log(qb.toString());
    return qb;
}

// TODO Once all queries are finished, double-check them to make sure they all are filtering by universe
// TODO Add outcome info/payout numerators to all queries
export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  params.account = params.account.toLowerCase();
  params.universe = params.universe.toLowerCase();
  const getAccountTransactionHistoryResponse = await db.select("data.*", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    // if (params.action === Action.BUY || params.action === Action.ALL) {
    //   qb.union((qb: Knex.QueryBuilder) => {
    //     queryBuy(db, qb, params);
    //   })
    // }
    // if ((params.action === Action.SELL || params.action === Action.ALL) && params.coin === "ETH") {
    //   qb.union((qb: Knex.QueryBuilder) => {
    //     querySell(db, qb, params);
    //   })
    // }
    if (params.action === Action.CLAIM || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaim(db, qb, params);
      })
    }
    if (params.action === Action.MARKET_CREATION || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryMarketCreation(db, qb, params);
      })
    }
    if ((params.action === Action.DISPUTE || params.action === Action.ALL) && (params.coin === "REP" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryDispute(db, qb, params);
      })
    }
    if ((params.action === Action.INITIAL_REPORT || params.action === Action.ALL) && (params.coin === "REP" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryInitialReport(db, qb, params);
      })
    }
    if ((params.action === Action.COMPLETE_SETS || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryCompleteSets(db, qb, params);
      })
    }
    if (qb.toString() === "select *") {
      // TODO Handle invalid action/coin combination
      console.log("Invalid action/coin combination");
    }
    qb.as("data");
  })
  .join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
  .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
  .whereBetween("blocks.timestamp", [params.earliestTransactionTime, params.latestTransactionTime])
  .orderBy("blocks.timestamp", "desc");

  // TODO Enable use of SortLimitParams

  return getAccountTransactionHistoryResponse;
}

import * as t from "io-ts";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Action, Coin, SortLimitParams, AccountTransactionHistoryRow } from "../../types";
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

async function transformQueryResults(db: Knex, queryResults: Array<AccountTransactionHistoryRow<BigNumber>>) {
  return await Promise.all(queryResults.map(async (queryResult: AccountTransactionHistoryRow<BigNumber>) => {
    if (queryResult.action === "BUY") {
      queryResult.fee = queryResult.reporterFees.plus(queryResult.marketCreatorFees);
      queryResult.total = queryResult.quantity.times((queryResult.maxPrice).minus(queryResult.price));
    } else if (queryResult.action === "SELL") {
      queryResult.fee = queryResult.reporterFees.plus(queryResult.marketCreatorFees);
      queryResult.total = queryResult.quantity.times(queryResult.price);
    } else if (queryResult.action === "DISPUTE" || queryResult.action === "INITIAL_REPORT") {
      const divisor = new BigNumber(100000000000000000);
      queryResult.quantity = queryResult.quantity.dividedBy(divisor);
    } else if (
      queryResult.action === Action.CLAIM_MARKET_CREATOR_FEES || 
      queryResult.action === Action.CLAIM_PARTICIPATION_TOKENS || 
      queryResult.action === Action.CLAIM_TRADING_PROCEEDS || 
      queryResult.action === Action.CLAIM_WINNING_CROWDSOURCERS
    ) {
      const divisor = new BigNumber(100000000000000000);
      if (queryResult.action === Action.CLAIM_TRADING_PROCEEDS) {
        const payoutKey = `payout${queryResult.outcome}` as keyof AccountTransactionHistoryRow<BigNumber>;
        const payoutAmount = queryResult[payoutKey] as BigNumber;
        if (payoutAmount) {
          queryResult.fee = queryResult.numShares.times(new BigNumber(payoutAmount)).minus(queryResult.numPayoutTokens).dividedBy(divisor);
          if (queryResult.fee.isLessThan(0)) {
            queryResult.fee = new BigNumber(0);
          }
        }
      }

      queryResult.quantity = queryResult.quantity.dividedBy(divisor);
      queryResult.total = queryResult.total.dividedBy(divisor);
    } else if (queryResult.action === Action.COMPLETE_SETS && queryResult.details === "Sell complete sets") {
      queryResult.total = queryResult.quantity.times(queryResult.price); // Calculate total before subtracting fees
      queryResult.fee = (queryResult.fee.times(queryResult.total)).plus((queryResult.marketCreatorFees).times(queryResult.total)); // (reporting fee rate * total) + (creator fee rate * total)
      queryResult.total = queryResult.total.minus(queryResult.fee); // Subtract fees from total
    }

    // Ensure outcome is set
    if (queryResult.payout0 !== null) {
      if (queryResult.isInvalid) {
        queryResult.outcomeDescription = "Invalid";
      } else {
        if (queryResult.marketType === "yesNo") {
          queryResult.outcome = queryResult.payout0.isGreaterThanOrEqualTo(queryResult.payout1) ? 0 : 1;
        } else if (queryResult.marketType === "scalar") {
          queryResult.outcome = queryResult.payout0.isGreaterThanOrEqualTo(queryResult.payout1) ? queryResult.payout0.toNumber() : queryResult.payout1.toNumber();
        } else if (queryResult.marketType === "categorical") {
          queryResult.outcome = 0;
          const maxPayouts = 8;
          for (let payoutIndex = 1; payoutIndex < maxPayouts; payoutIndex++) {
            const payoutKey = `payout${payoutIndex}` as keyof AccountTransactionHistoryRow<BigNumber>;
            if (queryResult[payoutKey] !== null) {
              const payoutAmount = queryResult[payoutKey] as BigNumber;
              if (payoutAmount.isGreaterThan(new BigNumber(queryResult.outcome))) {
                queryResult.outcome = payoutIndex;
                break;
              }
            }
          }
        }
      }
    }

    // Ensure outcomeDescription is set
    if (queryResult.outcome !== null && queryResult.outcomeDescription === null) {
      if (queryResult.isInvalid) {
        queryResult.outcomeDescription = "Invalid";
      } else if (queryResult.marketType === "yesNo") {
        if (queryResult.outcome === 0) {
          queryResult.outcomeDescription = "No";
        } else {
          queryResult.outcomeDescription = "Yes";
        }
      } else if (queryResult.marketType === "scalar") {
        queryResult.outcomeDescription = queryResult.scalarDenomination;
      } else if (queryResult.marketType === "categorical") {
        const outcomeInfo = await db.select("*")
        .from((qb: Knex.QueryBuilder) => {
          return qb.select("outcomes.description")
          .from("outcomes")
          .where({
            marketId: queryResult.marketId, 
            outcome: queryResult.outcome,
          });
        });
        queryResult.outcomeDescription = outcomeInfo[0].description;
      }
    }

    delete queryResult.marketId;
    delete queryResult.marketCreatorFees;
    delete queryResult.marketType;
    delete queryResult.maxPrice;
    delete queryResult.numPayoutTokens;
    delete queryResult.numShares;
    delete queryResult.reporterFees;
    delete queryResult.scalarDenomination;
    delete queryResult.payout0;
    delete queryResult.payout1;
    delete queryResult.payout2;
    delete queryResult.payout3;
    delete queryResult.payout4;
    delete queryResult.payout5;
    delete queryResult.payout6;
    delete queryResult.payout7;
    delete queryResult.isInvalid;
    return queryResult;
  }));
}

function queryBuy(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.BUY),
    db.raw("'ETH' as coin"),
    db.raw("'Buy order' as details"),
    "markets.marketId",
    "trades.marketCreatorFees",
    "markets.marketType",
    "markets.maxPrice",
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    "trades.reporterFees",
    "markets.scalarDenomination",
    db.raw("NULL as fee"),
    "markets.shortDescription as marketDescription",
    "outcomes.outcome",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
    "trades.price",
    db.raw("trades.amount as quantity"),
    db.raw("NULL as total"),
    "trades.transactionHash")
  .from("trades")
  .join("markets", "markets.marketId", "trades.marketId")
  .join("outcomes", function () {
    this
      .on("outcomes.marketId", "trades.marketId")
      .on("outcomes.outcome", "trades.outcome");
  })
  .where({
    "trades.orderType": "buy",
    "trades.creator": params.account,
    "markets.universe": params.universe,
  });
}

function querySell(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.SELL),
    db.raw("'ETH' as coin"),
    db.raw("'Sell order' as details"),
    "markets.marketId",
    "trades.marketCreatorFees",
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    "trades.reporterFees",
    "markets.scalarDenomination",
    db.raw("NULL as fee"),
    "markets.shortDescription as marketDescription",
    "outcomes.outcome",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
    "trades.price",
    db.raw("trades.amount as quantity"),
    db.raw("NULL as total"),
    "trades.transactionHash")
  .from("trades")
  .join("markets", "markets.marketId", "trades.marketId")
  .join("outcomes", function () {
    this
      .on("outcomes.marketId", "trades.marketId")
      .on("outcomes.outcome", "trades.outcome");
  })
  .where({
    "trades.orderType": "sell",
    "trades.creator": params.account,
    "markets.universe": params.universe,
  });
}

function queryCanceled(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.CANCEL),
    db.raw("'ETH' as coin"),
    db.raw("'Canceled order' as details"),
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("'0' as fee"),
    "markets.shortDescription as marketDescription",
    "outcomes.outcome",
    db.raw("outcomes.description as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
    db.raw("orders.price as price"),
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

function queryClaimMarketCreatorFees(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.CLAIM_MARKET_CREATOR_FEES),
    db.raw("'ETH' as coin"),
    db.raw("'Claimed market creator fees' as details"),
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("'0' as fee"),
    db.raw("markets.shortDescription as marketDescription"),
    db.raw("NULL as outcome"),
    db.raw("NULL as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
    db.raw("'0' as price"),
    db.raw("'0' as quantity"),
    db.raw("transfers.value as total"),
    "transfers.transactionHash")
  .from("transfers")
  .join("markets", "markets.marketCreatorMailbox", "transfers.sender")
  .whereNull("transfers.recipient")
  .where({
    "markets.marketCreator": params.account,
    "markets.universe": params.universe,
  });
}

function queryClaimParticipationTokens(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.CLAIM_PARTICIPATION_TOKENS),
    db.raw("'ETH' as coin"),
    db.raw("'Claimed reporting fees from participation tokens' as details"),
    db.raw("NULL as marketId"),
    db.raw("NULL as marketCreatorFees"),
    db.raw("NULL as marketType"),
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    db.raw("NULL as scalarDenomination"),
    db.raw("'0' as fee"),
    db.raw("'' as marketDescription"),
    db.raw("NULL as outcome"),
    db.raw("NULL as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
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
}

function queryClaimTradingProceeds(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  return qb.select(
    db.raw("? as action", Action.CLAIM_TRADING_PROCEEDS),
    db.raw("'ETH' as coin"),
    db.raw("'Claimed trading proceeds' as details"),
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    "trading_proceeds.numPayoutTokens",
    "trading_proceeds.numShares",
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("NULL as fee"),
    "markets.shortDescription as marketDescription",
    "outcomes.outcome",
    db.raw("outcomes.description as outcomeDescription"),
    "payouts.payout0",
    "payouts.payout1",
    "payouts.payout2",
    "payouts.payout3",
    "payouts.payout4",
    "payouts.payout5",
    "payouts.payout6",
    "payouts.payout7",
    "payouts.isInvalid",
    "outcomes.price",
    db.raw("trading_proceeds.numShares as quantity"),
    db.raw("trading_proceeds.numPayoutTokens as total"),
    "trading_proceeds.transactionHash")
  .from("trading_proceeds")
  .join("markets", "markets.marketId", "trading_proceeds.marketId")
  .join("payouts", "payouts.marketId", "markets.marketId")
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
}

function queryClaimWinningCrowdsourcers(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  if (params.coin === Coin.ETH || params.coin === Coin.ALL) {
    // Get ETH reporting fees claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM_WINNING_CROWDSOURCERS),
        db.raw("'ETH' as coin"),
        db.raw("'Claimed reporting fees from crowdsourcers' as details"),
        "markets.marketId",
        db.raw("NULL as marketCreatorFees"),
        "markets.marketType",
        db.raw("NULL as maxPrice"),
        db.raw("NULL as numPayoutTokens"),
        db.raw("NULL as numShares"),
        db.raw("NULL as reporterFees"),
        "markets.scalarDenomination",
        db.raw("'0' as fee"),
        "markets.shortDescription as marketDescription",
        db.raw("NULL as outcome"),
        db.raw("NULL as outcomeDescription"),
        "payouts.payout0",
        "payouts.payout1",
        "payouts.payout2",
        "payouts.payout3",
        "payouts.payout4",
        "payouts.payout5",
        "payouts.payout6",
        "payouts.payout7",
        "payouts.isInvalid",
        db.raw("'0' as price"),
        db.raw("'0' as quantity"),
        db.raw("crowdsourcer_redeemed.reportingFeesReceived as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .join("payouts", function () {
        this
          .on("payouts.payoutId", "crowdsourcers.payoutId")
          .on("payouts.marketId", "markets.marketId");
      })
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe,
      });
    });
  }

  if (params.coin === Coin.REP || params.coin === Coin.ALL) {
    // Get REP claimed from winning crowdsourcers
    qb.union((qb: Knex.QueryBuilder) => {
      qb.select(
        db.raw("? as action", Action.CLAIM_WINNING_CROWDSOURCERS),
        db.raw("'REP' as coin"),
        db.raw("'Claimed REP fees from crowdsourcers' as details"),
        "markets.marketId",
        db.raw("NULL as marketCreatorFees"),
        "markets.marketType",
        db.raw("NULL as maxPrice"),
        db.raw("NULL as numPayoutTokens"),
        db.raw("NULL as numShares"),
        db.raw("NULL as reporterFees"),
        "markets.scalarDenomination",
        db.raw("'0' as fee"),
        "markets.shortDescription as marketDescription",
        db.raw("NULL as outcome"),
        db.raw("NULL as outcomeDescription"),
        "payouts.payout0",
        "payouts.payout1",
        "payouts.payout2",
        "payouts.payout3",
        "payouts.payout4",
        "payouts.payout5",
        "payouts.payout6",
        "payouts.payout7",
        "payouts.isInvalid",
        db.raw("'0' as price"),
        db.raw("'0' as quantity"),
        db.raw("crowdsourcer_redeemed.repReceived as total"),
        "crowdsourcer_redeemed.transactionHash")
      .from("crowdsourcer_redeemed")
      .join("markets", "markets.marketId", "crowdsourcers.marketId")
      .join("crowdsourcers", "crowdsourcers.crowdsourcerId", "crowdsourcer_redeemed.crowdsourcer")
      .join("payouts", function () {
        this
          .on("payouts.payoutId", "crowdsourcers.payoutId")
          .on("payouts.marketId", "markets.marketId");
      })
      .where({
        "crowdsourcer_redeemed.reporter": params.account,
        "markets.universe": params.universe,
      });
    });
  }

  return qb;
}

function queryDispute(db: Knex, qb: Knex.QueryBuilder, params: GetAccountTransactionHistoryParamsType) {
  // Get REP staked in dispute crowdsourcers
  return qb.select(
    db.raw("? as action", Action.DISPUTE), 
    db.raw("'REP' as coin"),
    db.raw("'REP staked in dispute crowdsourcers' as details"),
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("'0' as fee"),
    "markets.shortDescription as marketDescription", 
    db.raw("NULL as outcome"),
    db.raw("NULL as outcomeDescription"),
    "payouts.payout0",
    "payouts.payout1",
    "payouts.payout2",
    "payouts.payout3",
    "payouts.payout4",
    "payouts.payout5",
    "payouts.payout6",
    "payouts.payout7",
    "payouts.isInvalid",
    db.raw("'0' as price"),
    db.raw("disputes.amountStaked as quantity"),
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
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("'0' as fee"),
    "markets.shortDescription as marketDescription",
    db.raw("NULL as outcome"),
    db.raw("NULL as outcomeDescription"),
    "payouts.payout0",
    "payouts.payout1",
    "payouts.payout2",
    "payouts.payout3",
    "payouts.payout4",
    "payouts.payout5",
    "payouts.payout6",
    "payouts.payout7",
    "payouts.isInvalid",
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
    "markets.marketId",
    db.raw("NULL as marketCreatorFees"),
    "markets.marketType",
    db.raw("NULL as maxPrice"),
    db.raw("NULL as numPayoutTokens"),
    db.raw("NULL as numShares"),
    db.raw("NULL as reporterFees"),
    "markets.scalarDenomination",
    db.raw("markets.creationFee as fee"), 
    "markets.shortDescription as marketDescription",
    db.raw("NULL as outcome"),
    db.raw("NULL as outcomeDescription"),
    db.raw("NULL as payout0"),
    db.raw("NULL as payout1"),
    db.raw("NULL as payout2"),
    db.raw("NULL as payout3"),
    db.raw("NULL as payout4"),
    db.raw("NULL as payout5"),
    db.raw("NULL as payout6"),
    db.raw("NULL as payout7"),
    db.raw("NULL as isInvalid"),
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
      "markets.marketId",
      db.raw("NULL as marketCreatorFees"),
      "markets.marketType",
      db.raw("NULL as maxPrice"),
      db.raw("NULL as numPayoutTokens"),
      db.raw("NULL as numShares"),
      db.raw("NULL as reporterFees"),
      "markets.scalarDenomination",
      db.raw("'0' as fee"),
      "markets.shortDescription as marketDescription", 
      db.raw("NULL as outcome"),
      db.raw("NULL as outcomeDescription"),
      db.raw("NULL as payout0"),
      db.raw("NULL as payout1"),
      db.raw("NULL as payout2"),
      db.raw("NULL as payout3"),
      db.raw("NULL as payout4"),
      db.raw("NULL as payout5"),
      db.raw("NULL as payout6"),
      db.raw("NULL as payout7"),
      db.raw("NULL as isInvalid"),
      db.raw("markets.numTicks as price"),
      db.raw("completeSets.numCompleteSets as quantity"),
      db.raw("'0' as total"),
      "completeSets.transactionHash")
    .from("completeSets")
    .join("markets", "markets.marketId", "completeSets.marketId")
    .where({
      "completeSets.eventName": "CompleteSetsPurchased",
      "completeSets.account": params.account,
      "markets.universe": params.universe,
    });
  });

  // Get complete sets sold
  qb.union((qb: Knex.QueryBuilder) => {
    qb.select(
      db.raw("? as action", Action.COMPLETE_SETS),
      db.raw("'ETH' as coin"),
      db.raw("'Sell complete sets' as details"),
      "markets.marketId",
      db.raw("markets.marketCreatorFeeRate as marketCreatorFees"),
      "markets.marketType",
      db.raw("NULL as maxPrice"),
      db.raw("NULL as numPayoutTokens"),
      db.raw("NULL as numShares"),
      db.raw("NULL as reporterFees"),
      "markets.scalarDenomination",
      db.raw("fee_windows.fees as fee"),
      "markets.shortDescription as marketDescription", 
      db.raw("NULL as outcome"),
      db.raw("NULL as outcomeDescription"),
      db.raw("NULL as payout0"),
      db.raw("NULL as payout1"),
      db.raw("NULL as payout2"),
      db.raw("NULL as payout3"),
      db.raw("NULL as payout4"),
      db.raw("NULL as payout5"),
      db.raw("NULL as payout6"),
      db.raw("NULL as payout7"),
      db.raw("NULL as isInvalid"),
      "markets.numTicks as price",
      "completeSets.numCompleteSets as quantity",
      db.raw("'0' as total"),
      "completeSets.transactionHash")
    .from("completeSets")
    .join("markets", "markets.marketId", "completeSets.marketId")
    .join("fee_windows", "fee_windows.universe", "markets.universe")
    .join("transactionHashes", "transactionHashes.transactionHash", "completeSets.transactionHash")
    .join("blocks", "blocks.blockNumber", "transactionHashes.blockNumber")
    .whereRaw("blocks.timestamp between fee_windows.startTime and fee_windows.endTime")
    .where({
      "completeSets.eventName": "CompleteSetsSold",
      "transactionHashes.removed": 0,
      "completeSets.account": params.account,
      "markets.universe": params.universe,
    });
  });

  return qb;
}

export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  params.account = params.account.toLowerCase();
  params.universe = params.universe.toLowerCase();

  const query = db.select("data.*", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    if ((params.action === Action.BUY || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryBuy(db, qb, params);
      });
    }
    if ((params.action === Action.SELL || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        querySell(db, qb, params);
      });
    }
    if ((params.action === Action.CANCEL || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryCanceled(db, qb, params);
      });
    }
    if ((params.action === Action.CLAIM_MARKET_CREATOR_FEES || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaimMarketCreatorFees(db, qb, params);
      });
    }
    if ((params.action === Action.CLAIM_PARTICIPATION_TOKENS || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaimParticipationTokens(db, qb, params);
      });
    }
    if ((params.action === Action.CLAIM_TRADING_PROCEEDS || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaimTradingProceeds(db, qb, params);
      });
    }
    if (params.action === Action.CLAIM_WINNING_CROWDSOURCERS || params.action === Action.ALL) {
      qb.union((qb: Knex.QueryBuilder) => {
        queryClaimWinningCrowdsourcers(db, qb, params);
      });
    }
    if ((params.action === Action.MARKET_CREATION || params.action === Action.ALL) && (params.coin === "ETH" || params.coin === "ALL")) {
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
      throw new Error("Invalid action/coin combination");
    }
    qb.as("data");
  })
  .join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
  .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
  .whereBetween("blocks.timestamp", [params.earliestTransactionTime, params.latestTransactionTime]);

  const accountTransactionHistory: Array<AccountTransactionHistoryRow<BigNumber>> = await queryModifier<AccountTransactionHistoryRow<BigNumber>>(db, query, "blocks.timestamp", "desc", params);
  
  return await transformQueryResults(db, accountTransactionHistory);
}

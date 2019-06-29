import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import * as _ from "lodash";
import { Address, OutcomesLiquidityRow } from "../types";
import { Percent, percent, Price, scalar, Scalar, Shares, Tokens, tokens } from "./dimension-quantity";
import { getSharePrice, MarketMaxPrice, MarketMinPrice, ReporterFeeRate, TotalFeeRate, continuousCompound } from "./financial-math";
import { currentStandardGasPriceGwei } from "./gas";
import { BidsAndAsks, getMarketOrderBooks, OrderBook, QuantityAtPrice } from "./simulated-order-book";

export const DefaultSpreadPercentString: string = "1";
export const DefaultSpreadPercentBigNumber: BigNumber = new BigNumber(DefaultSpreadPercentString, 10);

export const DefaultInvalidROIPercentString: string = "0";
export const DefaultInvalidROIPercentBigNumber: BigNumber = new BigNumber(DefaultInvalidROIPercentString, 10);

export const DefaultTakerInvalidProfitTokensString: string = "0";
export const DefaultTakerInvalidProfitTokensBigNumber: BigNumber = new BigNumber(DefaultTakerInvalidProfitTokensString, 10);

interface GetInvalidMetricsParams extends MarketMinPrice, MarketMaxPrice, ReporterFeeRate, TotalFeeRate, BidsAndAsks {
  numOutcomes: number; // number of outcomes in this market
  endDate: Date;
}

interface InvalidMetrics {
  invalidROIPercent: Percent;
  bestBidTakerInvalidProfitTokens: Tokens;
  bestAskTakerInvalidProfitTokens: Tokens;
}

interface GetOutcomeSpreadParams extends MarketMinPrice, MarketMaxPrice, BidsAndAsks {
  percentQuantityIncludedInSpread: Percent; // tuning parameter. Percent quantity of largest side order book side that will be used to calculate spread percent
}

const DefaultPercentQuantityIncludedInSpread = new Percent(new BigNumber(0.1)); // default for GetOutcomeSpreadParams.percentQuantityIncludedInSpread

interface GetOutcomeSpreadResult {
  spreadPercent: Percent;
}

// updateLiquidityMetricsForMarketAndOutcomes updates all liquidity metrics in DB
// for passed marketId. Clients must call updateLiquidityMetricsForMarketAndOutcomes
// each time the orders table changes for any reason.
export async function updateLiquidityMetricsForMarketAndOutcomes(db: Knex, marketId: Address): Promise<void> {
  const marketOrderBooks = await getMarketOrderBooks(db, marketId);

  const outcomeLiquidityMetrics: Array<InvalidMetrics & GetOutcomeSpreadResult & GetLiquidityResult & { outcome: number }> = marketOrderBooks.orderBooks.map((ob) => {
    const invalidMetrics = getInvalidMetrics({
      ...ob.orderBook.getBidsAndAsks(), // WARNING we rely on getInvalidMetrics to not modify market order books because getBidsAndAsks currently doesn't do a deep clone
      ...marketOrderBooks,
    });

    const outcomeSpread = getOutcomeSpread({
      ...ob.orderBook.getBidsAndAsks(), // WARNING we rely on getOutcomeSpread to not modify market order books because getBidsAndAsks currently doesn't do a deep clone
      ...marketOrderBooks,
      percentQuantityIncludedInSpread: DefaultPercentQuantityIncludedInSpread,
    });

    // WARNING getLiquidity mutates order book which is ok only because it's the last thing to depend on order books
    const liquidity = getLiquidity({
      spreadPercents: LIQUIDITY_SPREAD_PERCENTS,
      completeSetCost: marketOrderBooks.displayRange,
      feeRate: marketOrderBooks.totalFeeRate,
      orderBook: ob.orderBook,
    });

    return {
      outcome: ob.outcome,
      ...invalidMetrics,
      ...outcomeSpread,
      ...liquidity,
    };
  });

  const marketSpreadPercent: Percent = outcomeLiquidityMetrics.reduce<Percent>(
    (maxSpreadPercent, os) => maxSpreadPercent.max(os.spreadPercent),
    Percent.ZERO);

  const marketInvalidROIPercent: Percent = outcomeLiquidityMetrics.reduce<Percent>(
    (maxInvalidROIPercent, os) => maxInvalidROIPercent.max(os.invalidROIPercent),
    Percent.ZERO);

  const marketBestBidTakerInvalidProfitTokens: Tokens = outcomeLiquidityMetrics.reduce<Tokens>(
    (bestBidTakerInvalidProfitTokens, os) => bestBidTakerInvalidProfitTokens.max(os.bestBidTakerInvalidProfitTokens),
    outcomeLiquidityMetrics[0].bestBidTakerInvalidProfitTokens);

  const marketBestAskTakerInvalidProfitTokens: Tokens = outcomeLiquidityMetrics.reduce<Tokens>(
    (bestAskTakerInvalidProfitTokens, os) => bestAskTakerInvalidProfitTokens.max(os.bestAskTakerInvalidProfitTokens),
    outcomeLiquidityMetrics[0].bestAskTakerInvalidProfitTokens);

  outcomeLiquidityMetrics.forEach(async (os) => {
    await db("outcomes").update({
      spreadPercent: os.spreadPercent.magnitude.toString(),
      invalidROIPercent: os.invalidROIPercent.magnitude.toString(),
      bestBidTakerInvalidProfitTokens: os.bestBidTakerInvalidProfitTokens.magnitude.toString(),
      bestAskTakerInvalidProfitTokens: os.bestAskTakerInvalidProfitTokens.magnitude.toString(),
    }).where({ outcome: os.outcome, marketId });
  });

  await db("markets").update({
    spreadPercent: marketSpreadPercent.magnitude.toString(),
    invalidROIPercent: marketInvalidROIPercent.magnitude.toString(),
    bestBidTakerInvalidProfitTokens: marketBestBidTakerInvalidProfitTokens.magnitude.toString(),
    bestAskTakerInvalidProfitTokens: marketBestAskTakerInvalidProfitTokens.magnitude.toString(),
  }).where({ marketId });

  await updateOutcomesLiquidity(db, marketId, outcomeLiquidityMetrics);
}

function getInvalidSharePrice(params: GetInvalidMetricsParams, feeRate: Percent): Price {
  const marketDisplayRange = params.marketMaxPrice.minus(params.marketMinPrice);
  const invalidTradePriceMinusMinPrice: Price =
    marketDisplayRange.dividedBy(scalar(params.numOutcomes));

  // Eg. invalidSharePriceWithoutFees==0.5 for binary and scalar markets;
  // invalidSharePriceWithoutFees==0.333 for categorical markets with three outcomes;
  // invalidSharePriceWithoutFees=5 for a scalar market with min=10, max=20.
  const invalidSharePriceWithoutFees = getSharePrice({
    ...params,
    tradePriceMinusMinPrice: invalidTradePriceMinusMinPrice,
    positionType: "long",
  }).sharePrice;

  // The proceeds from redeeming an invalid share are reduced by any fees paid.
  const invalidSharePriceWithFees = invalidSharePriceWithoutFees
    .multipliedBy(Scalar.ONE.minus(feeRate));
  return invalidSharePriceWithFees;
}

// getInvalidROIPercent returns the return on investment percent the order creator
// of this outcome's best bid and ask would get if this market was determined to be
// invalid. The intuition is that although v1 cannot measure market invalidity we
// can still detect an order book that will profit if the market becomes invalid.
function getInvalidROIPercent(params: GetInvalidMetricsParams): Percent {
  // Defensively assume that the market creator fees are going to the creator
  // of the orders on the book, ie. we assume that order creator is the market
  // creator. This causes invalidROIPercent to potentially be erroneously higher
  // in the general case- because most order creators aren't in fact the market
  // creator- but it removes the attack vector where invalidROIPercent is zero but a
  // market creator could still make profit on an invalid market from creator fees.
  const invalidSharePrice: Price = getInvalidSharePrice(params, params.reporterFeeRate);

  const bestBidSharePrice: undefined | Price = params.bidsSortedByPriceDescending.length < 1 ? undefined : getSharePrice({
    ...params,
    tradePriceMinusMinPrice:
      params.bidsSortedByPriceDescending[0].tradePrice.minus(params.marketMinPrice),
    positionType: "long",
  }).sharePrice;

  const bestAskSharePrice: undefined | Price = params.asksSortedByPriceAscending.length < 1 ? undefined : getSharePrice({
    ...params,
    tradePriceMinusMinPrice:
      params.asksSortedByPriceAscending[0].tradePrice.minus(params.marketMinPrice),
    positionType: "short",
  }).sharePrice;

  const bestBidROIPercent: undefined | Percent = (() => {
    if (bestBidSharePrice === undefined) return undefined;
    else if (bestBidSharePrice.lte(Price.ZERO)) return Percent.ZERO;
    return invalidSharePrice.dividedBy(bestBidSharePrice).expect(Percent).minus(Scalar.ONE);
  })();

  const bestAskROIPercent: undefined | Percent = (() => {
    if (bestAskSharePrice === undefined) return undefined;
    else if (bestAskSharePrice.lte(Price.ZERO)) return Percent.ZERO;
    return invalidSharePrice.multipliedBy(scalar(params.numOutcomes - 1)) // the short side gets N-1 shares which will resolve at invalid price
      .dividedBy(bestAskSharePrice).expect(Percent).minus(Scalar.ONE);
  })();

  const invalidROIPercent: Percent = (() => {
    if (bestBidROIPercent === undefined ||
      bestAskROIPercent === undefined ||
      bestBidROIPercent.lte(Percent.ZERO) ||
      bestAskROIPercent.lte(Percent.ZERO)) {
      return Percent.ZERO;
    }
    return bestBidROIPercent.plus(bestAskROIPercent).dividedBy(Scalar.TWO);
  })();

  return invalidROIPercent;
}

const gasToTrade = new BigNumber(1750000, 10); // 1.75M gas for a trade
const gasToClaimWinnings = new BigNumber(1000000, 10); // 1M gas to claim winnings
const tenToTheNine = new BigNumber(10 ** 9, 10);

const annualDiscountRate = percent(0.1);
const yearsAfterExpiryToAssumeFinalization = scalar(14.0 / 365.0);
const millisecondsPerYear = scalar(365 * 24 * 60 * 60 * 1000);

function yearsBetweenDates(params: {
  startDate: Date,
  endDate: Date,
}): Scalar {
  const millisDelta = scalar(params.endDate.getTime())
    .minus(scalar(params.startDate.getTime()));
  return millisDelta.dividedBy(millisecondsPerYear);
}

function getBestBidAskTakerInvalidProfit(params: GetInvalidMetricsParams): Pick<InvalidMetrics, "bestBidTakerInvalidProfitTokens" | "bestAskTakerInvalidProfitTokens"> {
  const invalidSharePrice: Price = getInvalidSharePrice(params, params.totalFeeRate);

  const bestBidQuantity: undefined | Shares = params.bidsSortedByPriceDescending.length < 1 ? undefined : params.bidsSortedByPriceDescending[0].quantity;
  const bestAskQuantity: undefined | Shares = params.asksSortedByPriceAscending.length < 1 ? undefined : params.asksSortedByPriceAscending[0].quantity;

  const bestBidTakerInvalidRevenue: undefined | Tokens = bestBidQuantity && bestBidQuantity.multipliedBy(invalidSharePrice)
    .multipliedBy(scalar(params.numOutcomes - 1)) // the taker is taking the short side of bestBid and gets N-1 shares which will resolve at invalid price
    .expect(Tokens);
  const bestAskTakerInvalidRevenue: undefined | Tokens = bestAskQuantity && bestAskQuantity.multipliedBy(invalidSharePrice).expect(Tokens);

  const bestBidTakerSharePrice: undefined | Price = params.bidsSortedByPriceDescending.length < 1 ? undefined : getSharePrice({
    ...params,
    tradePriceMinusMinPrice:
      params.bidsSortedByPriceDescending[0].tradePrice.minus(params.marketMinPrice),
    positionType: "short", // taker is taking the short side of the best bid
  }).sharePrice;
  const bestAskTakerSharePrice: undefined | Price = params.asksSortedByPriceAscending.length < 1 ? undefined : getSharePrice({
    ...params,
    tradePriceMinusMinPrice:
      params.asksSortedByPriceAscending[0].tradePrice.minus(params.marketMinPrice),
    positionType: "long", // taker is taking the long side of the best ask
  }).sharePrice;

  const takerGasCostToRealizeProfit = new Tokens(gasToTrade.plus(gasToClaimWinnings)
    .multipliedBy(currentStandardGasPriceGwei()).dividedBy(tenToTheNine)); // gas*(gwei/gas) = gwei / 10^9 = tokens

  const yearsToExpiry: Scalar = yearsBetweenDates({
    startDate: new Date(),
    endDate: params.endDate,
  });
  const timeToFinalizationInYears: Scalar =
    yearsToExpiry.plus(yearsAfterExpiryToAssumeFinalization)
      .max(Scalar.ZERO); // disallow negative timeToFinalizationInYears which would be like claiming invalid winnings in the past

  const bestBidTakerInvalidCost: undefined | Tokens = bestBidQuantity && bestBidTakerSharePrice &&
    continuousCompound({
      amount: bestBidQuantity.multipliedBy(bestBidTakerSharePrice).expect(Tokens),
      interestRate: annualDiscountRate,
      compoundingDuration: timeToFinalizationInYears,
    });
  const bestAskTakerInvalidCost: undefined | Tokens = bestAskQuantity && bestAskTakerSharePrice &&
    continuousCompound({
      amount: bestAskQuantity.multipliedBy(bestAskTakerSharePrice).expect(Tokens),
      interestRate: annualDiscountRate,
      compoundingDuration: timeToFinalizationInYears,
    });

  const bestBidTakerInvalidProfit: undefined | Tokens = bestBidTakerInvalidRevenue && bestBidTakerInvalidCost && bestBidTakerInvalidRevenue.minus(bestBidTakerInvalidCost).minus(takerGasCostToRealizeProfit);
  const bestAskTakerInvalidProfit: undefined | Tokens = bestAskTakerInvalidRevenue && bestAskTakerInvalidCost && bestAskTakerInvalidRevenue.minus(bestAskTakerInvalidCost).minus(takerGasCostToRealizeProfit);

  return {
    bestBidTakerInvalidProfitTokens: bestBidTakerInvalidProfit || Tokens.ZERO,
    bestAskTakerInvalidProfitTokens: bestAskTakerInvalidProfit || Tokens.ZERO,
  };
}

function getInvalidMetrics(params: GetInvalidMetricsParams): InvalidMetrics {
  return {
    invalidROIPercent: getInvalidROIPercent(params),
    ...getBestBidAskTakerInvalidProfit(params),
  };
}

function getOutcomeSpread(params: GetOutcomeSpreadParams): GetOutcomeSpreadResult {
  // numShares is the number of shares that will be used in the spreadPercent
  // calculation. numShares will be used from each side of order book,
  // so if numShares=10 then we'll take 10 from sell and 10 from buy.
  const numShares: Shares = (() => {
    const sumAskQuantity: Shares = params.asksSortedByPriceAscending.reduce<Shares>((sum, qtyAtPrice) => sum.plus(qtyAtPrice.quantity), Shares.ZERO);
    const sumBidQuantity: Shares =
      params.bidsSortedByPriceDescending.reduce<Shares>((sum, qtyAtPrice) => sum.plus(qtyAtPrice.quantity), Shares.ZERO);
    const percentSharesOfLargestSide: Shares = sumAskQuantity.max(sumBidQuantity)
      .multipliedBy(params.percentQuantityIncludedInSpread);

    // If entire book is empty then we'll set numShares to one which causes
    // spreadPercent to naturally and correctly be 100% because we'll take
    // one share from each side of an empty book, and our "empty book" has
    // infinite quantity bids at minPrice and asks at maxPrice (see below).
    return percentSharesOfLargestSide.isZero() ? Shares.ONE : percentSharesOfLargestSide;
  })();

  const bidValue = takeFromBidsOrAsks({
    numShares,
    marketMinPrice: params.marketMinPrice,
    marketMaxPrice: params.marketMaxPrice,
    bidsSortedByPriceDescending: params.bidsSortedByPriceDescending,
  });

  const askValue = takeFromBidsOrAsks({
    numShares,
    marketMinPrice: params.marketMinPrice,
    marketMaxPrice: params.marketMaxPrice,
    asksSortedByPriceAscending: params.asksSortedByPriceAscending,
  });

  const spreadPercent: Percent = (() => {
    const tmpSpreadPercent = askValue.minus(bidValue).dividedBy(
      params.marketMaxPrice.minus(params.marketMinPrice).multipliedBy(numShares))
      .expect(Percent);

    // tmpSpreadPercent may be negative if the passed bids/asks were corrupt such
    // that bids were greater than asks, which shouldn't happen since trades should
    // be created to clear the order book any time best best is greater than best ask.
    return tmpSpreadPercent.lt(Percent.ZERO) ? Percent.ZERO : tmpSpreadPercent;
  })();

  return {
    spreadPercent,
  };
}

const InfinityShares = new Shares(new BigNumber(Infinity));

// takeFromBidsOrAsks simulates consecutive takes from the passed
// bids or asks up until the passed numShares have been taken.
// Returns the total value (sum of TradePrice) of the takes.
function takeFromBidsOrAsks(params: {
  numShares: Shares,
} & MarketMinPrice & MarketMaxPrice & (
    Pick<GetOutcomeSpreadParams, "asksSortedByPriceAscending"> | Pick<GetOutcomeSpreadParams, "bidsSortedByPriceDescending">)): Tokens {
  let valueTaken = Tokens.ZERO;

  // params includes asksSortedByPriceAscending xor bidsSortedByPriceDescending.
  // In either case, we'll create a new array by appending an order with
  // infinite quantity. This has the effect of being able to take from
  // bidsOrAsks without it ever becoming empty, which helps calculate
  // spread percents when one side of the order book is small or empty.
  const bidsOrAsks: Array<QuantityAtPrice> = ("asksSortedByPriceAscending" in params) ?
    params.asksSortedByPriceAscending.concat([{
      quantity: InfinityShares,
      tradePrice: params.marketMaxPrice,
    }]) :
    params.bidsSortedByPriceDescending.concat([{
      quantity: InfinityShares,
      tradePrice: params.marketMinPrice,
    }]);

  let qtyRemainingToTake = params.numShares;
  let i = 0;
  while (qtyRemainingToTake.gt(Shares.ZERO)) {
    // bidsOrAsks[i] is always defined because we appended an order with infinite quantity to bidsOrAsks
    const qtyToTakeAtThisPrice = qtyRemainingToTake.min(bidsOrAsks[i].quantity);
    valueTaken = valueTaken.plus(
      qtyToTakeAtThisPrice.multipliedBy(bidsOrAsks[i].tradePrice).expect(Tokens));
    qtyRemainingToTake = qtyRemainingToTake.minus(qtyToTakeAtThisPrice);
    i += 1;
  }

  return valueTaken;
}

interface LiquidityTokensAtSpreadPercent {
  spreadPercent: Percent;
  liquidityTokens: Tokens;
}

interface GetLiquidityParams {
  spreadPercents: Array<Percent>;
  completeSetCost: Price;
  feeRate: Percent;
  orderBook: OrderBook;
}

interface GetLiquidityResult {
  liquidityTokensAtSpreadPercents: Array<LiquidityTokensAtSpreadPercent>;
}

export const MAX_SPREAD_PERCENT = 1;
const LIQUIDITY_SPREAD_PERCENTS: Array<Percent> = [
  percent(0.1),
  percent(0.15),
  percent(0.2),
  percent(MAX_SPREAD_PERCENT),
];

const SELL_INCREMENT_COST_DEFAULT: Tokens = tokens(0.02);
let SELL_INCREMENT_COST: Tokens = SELL_INCREMENT_COST_DEFAULT;
export function unsafeSetSELL_INCREMENT_COST(t: BigNumber): void {
  SELL_INCREMENT_COST = new Tokens(t);
}
export function unsafeResetSELL_INCREMENT_COST(): void {
  SELL_INCREMENT_COST = SELL_INCREMENT_COST_DEFAULT;
}

const ONE_HUNDRED_MILLION = scalar(100000000);
const MAX_ITERATIONS = 100000; // MAX_ITERATIONS is not arbitrary: the formula `MAX_ITERATIONS * SELL_INCREMENT_COST` is the amount of tokens that getLiquidity will process at "high resolution"

function getLiquidity(params: GetLiquidityParams): GetLiquidityResult {
  const sellIncrement: Shares =
    SELL_INCREMENT_COST.dividedBy(params.completeSetCost).expect(Shares);
  let liquidityTokenCost = Tokens.ZERO; // accrued/running total cost for complete sets bought from system
  let liquidityTokens = Tokens.ZERO; // accrued/running total revenue for complete sets sold into order book
  let nextLiquidityTokens = Tokens.ZERO; // value of liquidityTokens in next loop iteration because both next/current value are needed in algorithm

  const liquidityTokensAtSpreadPercents: Array<LiquidityTokensAtSpreadPercent> = [];

  // Spread percents are ascending so that we can use the liquidityTokens for
  // the previous spread percent as part of liquidityTokens for the next spread
  // percent because return on investment is monotonically decreasing as we take
  // from the order book each iteration because we take the best bids/asks first.
  const spreadPercentsAscending = _.sortBy(params.spreadPercents, (sp: Percent) => sp.magnitude.toNumber());
  let i = 0;
  let iterations = 0;
  while (i < spreadPercentsAscending.length) {
    iterations++;
    // When iterations exceeds MAX_ITERATIONS we'll greatly increase the
    // incremental take amount so as to terminate the algorithm faster. This is
    // because extremely large quantity with dust/epsilon prices orders function
    // as a denial of service attack because this algorithm processes quantity
    // incrementally, so if you have a 100k qty order and it's taking only
    // 0.05qty per iteration it's going to take two million iterations... and
    // the data structures are fairly inefficient so that takes a very long time.
    const sellIncrementCostThisIteration = SELL_INCREMENT_COST.multipliedBy(iterations > MAX_ITERATIONS ? ONE_HUNDRED_MILLION : Scalar.ONE);
    const sellIncrementThisIteration = sellIncrement.multipliedBy(iterations > MAX_ITERATIONS ? ONE_HUNDRED_MILLION : Scalar.ONE);

    // Incrementally sell complete sets into the order book
    liquidityTokenCost = liquidityTokenCost.plus(sellIncrementCostThisIteration);
    const proceedsThisIncrement: Tokens = params.orderBook
      .closeLongFillOnlyWithFeeAdjustment(sellIncrementThisIteration, params.feeRate)
      .plus(params.orderBook
        .closeShortFillOnlyWithFeeAdjustment(sellIncrementThisIteration, params.feeRate),
      );
    nextLiquidityTokens = liquidityTokens.plus(proceedsThisIncrement);

    // Determine if this incremental sell is the last one for spreadPercentsAscending[i] and possibly subsequent spread percents
    while (i < spreadPercentsAscending.length &&
      (proceedsThisIncrement.lte(Tokens.ZERO) ||
        nextLiquidityTokens.dividedBy(liquidityTokenCost).expect(Percent)
          .lt(Percent.ONE.minus(spreadPercentsAscending[i])))) {
      // One of two things happened
      //  1. proceedsThisIncrement is zero which means the order book is completely empty; this while loop will naturally terminate and assign liquidityTokens for the current and all remaining spreadPercents
      //  OR
      //  2. nextLiquidityTokens has a return-on-investment vs liquidityTokenCost that is too low to satisfy spreadPercentsAscending[i], ie. nextLiquidityTokens yields an implied spread percent that is now larger than spreadPercentsAscending[i], so we have determined the final liquidityTokens value for spreadPercentsAscending[i] (and that value is liquidityTokens, not nextLiquidityTokens, because nextLiquidityTokens was disqualified)
      liquidityTokensAtSpreadPercents.push({
        spreadPercent: spreadPercentsAscending[i],
        liquidityTokens,
      });
      i++;
    }
    liquidityTokens = nextLiquidityTokens;
  }
  return {
    liquidityTokensAtSpreadPercents,
  };
}

async function updateOutcomesLiquidity(db: Knex, marketId: string, data: Array<GetLiquidityResult & { outcome: number }>): Promise<void> {
  // We must delete all existing data because the passed data
  // may not correspond with what's previously in DB and we
  // don't want the DB containing a mixture of old/new metrics.
  await db.from("outcomes_liquidity").where("marketId", marketId).delete();

  const inserts: Array<OutcomesLiquidityRow<string>> = [];
  data.forEach((d) => {
    d.liquidityTokensAtSpreadPercents.forEach((l) => {
      inserts.push({
        marketId,
        outcome: d.outcome,
        spreadPercent: l.spreadPercent.magnitude.toString(),
        liquidityTokens: l.liquidityTokens.magnitude.toString(),
      });
    });
  });
  if (inserts.length > 0) {
    await db.batchInsert("outcomes_liquidity", inserts, inserts.length);
  }
}

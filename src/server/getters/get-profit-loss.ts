import { Augur } from "augur.js";
import BigNumber from "bignumber.js";
import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { Dictionary, NumericDictionary } from "lodash";
import { FrozenFunds } from "../../blockchain/log-processors/profit-loss/frozen-funds";
import { getCurrentTime } from "../../blockchain/process-block";
import { ZERO } from "../../constants";
import { Address } from "../../types";
import { Percent, Price, safePercent, Shares, Tokens } from "../../utils/dimension-quantity";
import { getRealizedProfitPercent, getTotalCost, getTotalProfit, getTotalProfitPercent, getTradePrice, getUnrealizedCost, getUnrealizedProfit, getUnrealizedProfitPercent, getUnrealizedRevenue } from "../../utils/financial-math";

const DEFAULT_NUMBER_OF_BUCKETS = 30;

export function getDefaultPLTimeseries(): ProfitLossTimeseries {
  return {
    timestamp: 0,
    account: "",
    marketId: "",
    outcome: 0,
    transactionHash: "",
    price: ZERO,
    position: ZERO,
    numOutcomes: 2,
    profit: ZERO,
    realizedCost: ZERO,
    minPrice: ZERO,
    maxPrice: ZERO,
    frozenFunds: ZERO,
  };
}

export function getDefaultOVTimeseries(): OutcomeValueTimeseries {
  return {
    timestamp: 0,
    marketId: "",
    outcome: 0,
    value: ZERO,
    transactionHash: "",
  };
}

export interface Timestamped {
  timestamp: number;
}

export interface ProfitLossTimeseries extends Timestamped, FrozenFunds {
  account: Address;
  marketId: Address;
  outcome: number;
  transactionHash: string;
  price: BigNumber; // denominated in tokens/share. average price user paid for shares in the current open position
  position: BigNumber; // denominated in shares. Known as "net position", this is the number of shares the user currently owns for this outcome; if it's a positive number, the user is "long" and earns money if the share price goes up; if it's a negative number the user is "short" and earns money if the share price goes down. Eg. "-15" means an open position of short 15 shares.
  numOutcomes: number;
  profit: BigNumber; // denominated in tokens. Realized profit of shares that were bought and sold
  realizedCost: BigNumber; // denominated in tokens. Cumulative cost of shares included in realized profit
  minPrice: BigNumber; // market minPrice in tokens. Helps convert between TradePriceMinusMinPrice, TradePrice, and SharePrice
  maxPrice: BigNumber; // market maxPrice in tokens. Helps convert between TradePriceMinusMinPrice, TradePrice, and SharePrice
}

export interface OutcomeValueTimeseries extends Timestamped {
  marketId: Address;
  outcome: number;
  value: BigNumber;
  transactionHash: string;
}

// ProfitLossResult is the profit or loss result, at a particular point in
// time, of a user's position in a single market outcome. ProfitLossResult
// represents the total accumulation of history (for this market
// outcome) as of an instantaneous point in time, like a balance sheet in
// accounting. A user's "position" refers to the shares they have bought
// ("long" position) or sold ("short" position) in this market outcome.
export interface ProfitLossResult extends
  Timestamped, // profit and loss as of this timestamp
  FrozenFunds { // funds the user froze to be in this position (see FrozenFunds docs)
  marketId: Address; // user's position is in this market
  outcome: number; // user's position is in this market outcome
  netPosition: BigNumber; // denominated in shares. See NetPosition
  averagePrice: BigNumber; // denominated in tokens/share. See AverageTradePriceMinusMinPriceForOpenPosition
  unrealizedCost: BigNumber; // denominated in tokens. See UnrealizedCost
  unrealizedRevenue: BigNumber; // denominated in tokens. See UnrealizedRevenue
  unrealized: BigNumber; // ie. unrealizedProfit. Denominated in tokens. See UnrealizedProfit
  unrealizedPercent: BigNumber; // unrealized profit percent. See UnrealizedProfitPercent
  realizedCost: BigNumber; // denominated in tokens. See RealizedCost
  realized: BigNumber; // ie. realizedProfit. Denominated in tokens. See RealizedProfit
  realizedPercent: BigNumber; // realized profit percent. See RealizedProfitPercent
  totalCost: BigNumber; // denominated in tokens. See TotalCost
  total: BigNumber; // ie totalProfit. Denominated in tokens. See TotalProfit
  totalPercent: BigNumber; // total profit percent. See TotalProfitPercent
  lastTradePrice: BigNumber; // denominated in tokens. Last (most recent) price at which this outcome was traded by anybody. See TradePrice
  lastTradePrice24hAgo: BigNumber; // denominated in tokens. As of 24 hours ago, last (most recent) price at which this outcome was traded by anybody. See TradePrice
  lastTradePrice24hChangePercent: BigNumber; // percent change in lastTradePrice from 24 hours ago (NB this is calculated using LastTradePriceMinusMinPrice, not LastTradePrice)
  unrealizedRevenue24hAgo: BigNumber; // denominated in tokens. See UnrealizedRevenue, except this is is calculated using lastTradePrice from 24 hours ago, as if the user held this position constant for the past 24 hours
  unrealizedRevenue24hChangePercent: BigNumber; // percent change in unrealizedRevenue from 24 hours ago
}

export interface ShortPosition {
  outcome: number;
  position: BigNumber;
}

const GetProfitLossSharedParams = t.type({
  universe: t.string,
  account: t.string,
  startTime: t.union([t.number, t.null]),
  endTime: t.union([t.number, t.null]),
  periodInterval: t.union([t.number, t.null]),
});

const MarketIdParams = t.type({
  marketId: t.union([t.string, t.null]),
});
export const GetProfitLossParams = t.intersection([GetProfitLossSharedParams, MarketIdParams]);
export type GetProfitLossParamsType = t.TypeOf<typeof GetProfitLossParams>;

const MarketIdAndOutcomeParams = t.type({
  marketId: t.string,
  outcome: t.number,
});
export const GetOutcomeProfitLossParams = t.intersection([GetProfitLossSharedParams, MarketIdAndOutcomeParams]);
export type GetOutcomeProfitLossParamsType = t.TypeOf<typeof GetOutcomeProfitLossParams>;

export const GetProfitLossSummaryParams = t.intersection([t.type({
  universe: t.string,
  account: t.string,
  marketId: t.union([t.string, t.null]),
}), t.partial({
  endTime: t.number,
})]);
export type GetProfitLossSummaryParamsType = t.TypeOf<typeof GetProfitLossSummaryParams>;

export function bucketRangeByInterval(startTime: number, endTime: number, periodInterval: number | null): Array<Timestamped> {
  if (startTime < 0) throw new Error("startTime must be a valid unix timestamp, greater than 0");
  if (endTime < 0) throw new Error("endTime must be a valid unix timestamp, greater than 0");
  if (endTime < startTime) throw new Error("endTime must be greater than or equal startTime");
  if (periodInterval !== null && periodInterval <= 0) throw new Error("periodInterval must be positive integer (seconds)");

  const interval = periodInterval == null ? Math.ceil((endTime - startTime) / DEFAULT_NUMBER_OF_BUCKETS) : periodInterval;

  const buckets: Array<Timestamped> = [];
  for (let bucketEndTime = startTime; bucketEndTime < endTime; bucketEndTime += interval) {
    buckets.push({ timestamp: bucketEndTime });
  }
  buckets.push({ timestamp: endTime });

  return buckets;
}

export function sumProfitLossResults<T extends ProfitLossResult>(left: T, right: T): T {
  const leftPosition = new BigNumber(left.netPosition, 10);
  const rightPosition = new BigNumber(right.netPosition, 10);

  const netPosition = leftPosition.plus(rightPosition);
  const averagePrice = left.averagePrice.plus(right.averagePrice).dividedBy(2);
  const realized = left.realized.plus(right.realized);
  const unrealized = left.unrealized.plus(right.unrealized);
  const unrealizedCost = left.unrealizedCost.plus(right.unrealizedCost);
  const unrealizedRevenue = left.unrealizedRevenue.plus(right.unrealizedRevenue);
  const realizedCost = left.realizedCost.plus(right.realizedCost);
  const totalCost = left.totalCost.plus(right.totalCost);
  const total = realized.plus(unrealized);
  const { unrealizedProfitPercent } = getUnrealizedProfitPercent({
    unrealizedCost: new Tokens(unrealizedCost),
    unrealizedProfit: new Tokens(unrealized),
  });
  const { realizedProfitPercent } = getRealizedProfitPercent({
    realizedCost: new Tokens(realizedCost),
    realizedProfit: new Tokens(realized),
  });
  const { totalProfitPercent } = getTotalProfitPercent({
    totalCost: new Tokens(totalCost),
    totalProfit: new Tokens(total),
  });

  return Object.assign(_.clone(left), {
    netPosition,
    averagePrice,
    realized,
    unrealized,
    total,
    unrealizedCost,
    realizedCost,
    totalCost,
    unrealizedPercent: unrealizedProfitPercent.magnitude,
    realizedPercent: realizedProfitPercent.magnitude,
    totalPercent: totalProfitPercent.magnitude,
    unrealizedRevenue,
  });
}

async function queryProfitLossTimeseries(db: Knex, now: number, params: GetProfitLossParamsType): Promise<Array<ProfitLossTimeseries>> {
  const query = db("wcl_profit_loss_timeseries")
    .select("wcl_profit_loss_timeseries.*", "markets.universe", "markets.numOutcomes", "markets.minPrice", "markets.maxPrice")
    .join("markets", "wcl_profit_loss_timeseries.marketId", "markets.marketId")
    .where({ account: params.account, universe: params.universe })
    .orderBy("timestamp");

  if (params.marketId !== null) query.where("wcl_profit_loss_timeseries.marketId", params.marketId);
  if (params.startTime) query.where("timestamp", ">=", params.startTime);

  query.where("timestamp", "<=", params.endTime || now);

  return await query;
}

async function queryOutcomeValueTimeseries(db: Knex, now: number, params: GetProfitLossParamsType): Promise<Array<OutcomeValueTimeseries>> {
  const query = db("outcome_value_timeseries")
    .select("outcome_value_timeseries.*", "markets.universe")
    .join("markets", "outcome_value_timeseries.marketId", "markets.marketId")
    .orderBy("timestamp");

  if (params.marketId !== null) query.where("outcome_value_timeseries.marketId", params.marketId);
  if (params.startTime) query.where("timestamp", ">=", params.startTime);

  query.where("timestamp", "<=", params.endTime || now);

  return await query;
}

function bucketAtTimestamps<T extends Timestamped>(timestampeds: Dictionary<Array<T>>, timestamps: Array<Timestamped>, defaultValue: T): Array<Array<T>> {
  return _.map(timestamps, (bucket) => {
    return _.map(timestampeds, (values, outcome: string) => {
      let result: T | undefined;
      const beforeBucket = _.takeWhile(values, (pl) => pl.timestamp <= bucket.timestamp);
      if (beforeBucket.length > 0) {
        _.drop(values, beforeBucket.length);
        result = _.last(beforeBucket);
      }

      if (!result) result = Object.assign({ outcome }, defaultValue);
      result.timestamp = bucket.timestamp;

      return result;
    });
  });
}

function getProfitResultsForTimestamp(plsAtTimestamp: Array<ProfitLossTimeseries>, outcomeValuesAtTimestamp: Array<OutcomeValueTimeseries> | null, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: Dictionary<Dictionary<OutcomeValueTimeseries>>): Array<ProfitLossResult> {
  const unsortedResults: Array<ProfitLossResult> = plsAtTimestamp.map((outcomePl) => {
    const realizedCost = new Tokens(outcomePl.realizedCost);
    const realizedProfit = new Tokens(outcomePl.profit);
    const outcome = outcomePl.outcome;
    const averageTradePriceMinusMinPriceForOpenPosition = new Price(outcomePl.price);
    const marketMinPrice = new Price(outcomePl.minPrice);
    const marketMaxPrice = new Price(outcomePl.maxPrice);
    const netPosition = new Shares(outcomePl.position);
    const frozenFunds = new Tokens(outcomePl.frozenFunds);

    const lastTradePriceMinusMinPrice24hAgo: Price | undefined = lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId[outcomePl.marketId] !== undefined ? (
      lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId[outcomePl.marketId][outcome] !== undefined ?
        new Price(lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId[outcomePl.marketId][outcome].value) : undefined
    ) : undefined;

    // Ie. averageTradePriceForOpenPosition is assigned to
    // ProfitLossResult.averagePrice, and ProfitLossResult.averagePrice
    // is a TradePrice and not TradePriceMinusMinPrice.
    const averageTradePriceForOpenPosition = getTradePrice({
      marketMinPrice,
      tradePriceMinusMinPrice: averageTradePriceMinusMinPriceForOpenPosition,
    }).tradePrice;

    const lastTradePriceMinusMinPrice: Price | undefined = outcomeValuesAtTimestamp ? new Price(outcomeValuesAtTimestamp[outcome].value).minus(marketMinPrice) : undefined;

    const { unrealizedCost } = getUnrealizedCost({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
    });
    const { unrealizedRevenue } = getUnrealizedRevenue({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      lastTradePriceMinusMinPrice,
    });
    const { unrealizedProfit } = getUnrealizedProfit({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      lastTradePriceMinusMinPrice,
    });
    const { totalCost } = getTotalCost({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      realizedCost,
    });
    const { totalProfit } = getTotalProfit({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      lastTradePriceMinusMinPrice,
      realizedProfit,
    });
    const { realizedProfitPercent } = getRealizedProfitPercent({
      realizedCost,
      realizedProfit,
    });
    const { unrealizedProfitPercent } = getUnrealizedProfitPercent({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      lastTradePriceMinusMinPrice,
    });
    const { totalProfitPercent } = getTotalProfitPercent({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      lastTradePriceMinusMinPrice,
      realizedCost,
      realizedProfit,
    });
    const { tradePrice: lastTradePrice } = getTradePrice({
      marketMinPrice,
      tradePriceMinusMinPrice: lastTradePriceMinusMinPrice || Price.ZERO,
    });
    const { tradePrice: lastTradePrice24hAgo } = getTradePrice({
      marketMinPrice,
      tradePriceMinusMinPrice: lastTradePriceMinusMinPrice24hAgo || Price.ZERO,
    });
    const lastTradePrice24hChangePercent: Percent = safePercent({
      numerator: lastTradePriceMinusMinPrice,
      denominator: lastTradePriceMinusMinPrice24hAgo,
      subtractOne: true,
    });
    const { unrealizedRevenue: unrealizedRevenue24hAgo } = getUnrealizedRevenue({
      marketMinPrice,
      marketMaxPrice,
      netPosition,
      lastTradePriceMinusMinPrice: lastTradePriceMinusMinPrice24hAgo,
    });
    const unrealizedRevenue24hChangePercent: Percent = safePercent({
      numerator: unrealizedRevenue,
      denominator: unrealizedRevenue24hAgo,
      subtractOne: true,
    });

    return {
      marketId: outcomePl.marketId,
      outcome,
      timestamp: outcomePl.timestamp,
      netPosition: netPosition.magnitude,
      realized: realizedProfit.magnitude,
      unrealized: unrealizedProfit.magnitude,
      total: totalProfit.magnitude,
      averagePrice: averageTradePriceForOpenPosition.magnitude,
      unrealizedCost: unrealizedCost.magnitude,
      realizedCost: realizedCost.magnitude,
      totalCost: totalCost.magnitude,
      realizedPercent: realizedProfitPercent.magnitude,
      unrealizedPercent: unrealizedProfitPercent.magnitude,
      totalPercent: totalProfitPercent.magnitude,
      unrealizedRevenue: unrealizedRevenue.magnitude,
      frozenFunds: frozenFunds.magnitude,
      lastTradePrice: lastTradePrice.magnitude,
      lastTradePrice24hAgo: lastTradePrice24hAgo.magnitude,
      lastTradePrice24hChangePercent: lastTradePrice24hChangePercent.magnitude,
      unrealizedRevenue24hAgo: unrealizedRevenue24hAgo.magnitude,
      unrealizedRevenue24hChangePercent: unrealizedRevenue24hChangePercent.magnitude,
    };
  });
  return _.sortBy(unsortedResults, "outcome")!;
}

function getProfitResultsForMarket(marketPls: Array<Array<ProfitLossTimeseries>>, marketOutcomeValues: Array<Array<OutcomeValueTimeseries>>, buckets: Array<Timestamped>, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: Dictionary<Dictionary<OutcomeValueTimeseries>>): Array<Array<ProfitLossResult>> {
  return _.map(marketPls, (outcomePLsAtTimestamp, timestampIndex) => {
    const nonZeroPositionOutcomePls = _.filter(outcomePLsAtTimestamp, (outcome) => !outcome.position.eq(ZERO));

    if (nonZeroPositionOutcomePls.length < 1) {
      return getProfitResultsForTimestamp(outcomePLsAtTimestamp, null, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId);
    }

    const numOutcomes = nonZeroPositionOutcomePls[0].numOutcomes;
    const outcomeValuesAtTimestamp = marketOutcomeValues ? marketOutcomeValues[timestampIndex] : _.fill(Array(numOutcomes), getDefaultOVTimeseries());

    // turn outcome values into real list
    const sortedOutcomeValues = _.reduce(_.range(numOutcomes), (result, outcomeIndex) => {
      let outcomeValue = _.find(outcomeValuesAtTimestamp, (ov) => ov.outcome === outcomeIndex);
      if (!outcomeValue) outcomeValue = Object.assign(getDefaultOVTimeseries(), { outcome: outcomeIndex });
      result.push(outcomeValue);
      return result;
    }, [] as Array<OutcomeValueTimeseries>);

    return getProfitResultsForTimestamp(outcomePLsAtTimestamp, sortedOutcomeValues, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId);
  });
}

interface ProfitLossData {
  profits: Dictionary<Dictionary<Array<ProfitLossTimeseries>>>;
  outcomeValues: Dictionary<Dictionary<Array<OutcomeValueTimeseries>>>; // historical lastTradePriceMinusMinPrices by outcome by marketId, see TradePriceMinusMinPrice
  buckets: Array<Timestamped>;
  lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: Dictionary<Dictionary<OutcomeValueTimeseries>>; // lastTradePriceMinusMinPrice by outcome by marketId as of 24 hours ago, see TradePriceMinusMinPrice
}

async function getProfitLossData(db: Knex, params: GetProfitLossParamsType): Promise<ProfitLossData> {
  const now = getCurrentTime();

  // Realized Profits + Timeseries data about the state of positions
  const profitsOverTime = await queryProfitLossTimeseries(db, now, params);
  const marketProfits = _.groupBy(profitsOverTime, (r) => r.marketId);
  const profits: Dictionary<Dictionary<Array<ProfitLossTimeseries>>> = _.reduce(marketProfits, (result, value, key) => {
    result[key] = _.groupBy(value, (r) => r.outcome);
    return result;
  }, {} as Dictionary<Dictionary<Array<ProfitLossTimeseries>>>);

  // Type there are no trades in this window then we'll return empty data
  if (_.isEmpty(profits)) {
    const buckets = bucketRangeByInterval(params.startTime || 0, params.endTime || now, params.periodInterval);
    return { profits: {}, outcomeValues: {}, buckets, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: {} };
  }

  // The value of an outcome over time, for computing unrealized profit and loss at a time
  const outcomeValuesOverTime = await queryOutcomeValueTimeseries(db, now, params);
  const marketOutcomeValues = _.groupBy(outcomeValuesOverTime, (r) => r.marketId);
  const outcomeValues: Dictionary<Dictionary<Array<OutcomeValueTimeseries>>> = _.reduce(marketOutcomeValues, (result, value, key) => {
    result[key] = _.groupBy(value, (r) => r.outcome);
    return result;
  }, {} as Dictionary<Dictionary<Array<OutcomeValueTimeseries>>>);

  // The timestamps at which we need to return results
  const startTime = params.startTime || profitsOverTime[0].timestamp;
  const maxResultTime = Math.max(_.last(profitsOverTime)!.timestamp, _.last(outcomeValuesOverTime)!.timestamp);
  const endTime = Math.min(maxResultTime, now);
  const interval = params.periodInterval || null;
  const buckets = bucketRangeByInterval(startTime, endTime, interval);

  return {
    profits,
    outcomeValues,
    buckets,
    lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: await getLastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId(db, now, params),
  };
}

export interface AllOutcomesProfitLoss {
  profit: Dictionary<Array<Array<ProfitLossResult>>>;
  buckets: Array<Timestamped>;
  marketOutcomes: Dictionary<number>;
}

export async function getAllOutcomesProfitLoss(db: Knex, params: GetProfitLossParamsType): Promise<AllOutcomesProfitLoss> {
  const { profits, outcomeValues, buckets, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId } = await getProfitLossData(db, params);

  const bucketedProfits = _.mapValues(profits, (pls, marketId) => {
    return bucketAtTimestamps<ProfitLossTimeseries>(pls, buckets, Object.assign(getDefaultPLTimeseries(), { marketId }));
  });

  const bucketedOutcomeValues = _.mapValues(outcomeValues, (marketOutcomeValues) => {
    return bucketAtTimestamps<OutcomeValueTimeseries>(marketOutcomeValues, buckets, getDefaultOVTimeseries());
  });

  const profit = _.mapValues(bucketedProfits, (pls, marketId) => {
    return getProfitResultsForMarket(pls, bucketedOutcomeValues[marketId], buckets, lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId);
  });

  const marketOutcomes = _.fromPairs(_.values(_.mapValues(profits, (pls) => {
    const first = _.first(_.first(_.values(pls)))!;
    return [first.marketId, first.numOutcomes];
  })));

  return {
    profit,
    marketOutcomes,
    buckets,
  };
}

export async function getProfitLoss(db: Knex, augur: Augur, params: GetProfitLossParamsType): Promise<Array<ProfitLossResult>> {
  const { profit: outcomesProfitLoss, buckets } = await getAllOutcomesProfitLoss(db, params);
  if (_.isEmpty(outcomesProfitLoss)) {
    return buckets.map((bucket) => ({
      timestamp: bucket.timestamp,
      position: ZERO,
      realized: ZERO,
      unrealized: ZERO,
      total: ZERO,
      cost: ZERO,
      averagePrice: ZERO,
      numEscrowed: ZERO,
      totalPosition: ZERO,
      outcome: 0,
      netPosition: ZERO,
      marketId: "",
      unrealizedCost: ZERO,
      realizedCost: ZERO,
      totalCost: ZERO,
      realizedPercent: ZERO,
      unrealizedPercent: ZERO,
      totalPercent: ZERO,
      unrealizedRevenue: ZERO,
      frozenFunds: ZERO,
      lastTradePrice: ZERO,
      lastTradePrice24hAgo: ZERO,
      lastTradePrice24hChangePercent: ZERO,
      unrealizedRevenue24hAgo: ZERO,
      unrealizedRevenue24hChangePercent: ZERO,
    }));
  }

  // This takes us from::
  //   <marketId>: [[{timestamp: N,... }, {timestamp: N,... }], [{timestamp: M,... }, {timestamp: M,... }]]
  //   <marketId>: [[{timestamp: N,... }, {timestamp: N,... }], [{timestamp: M,... }, {timestamp: M,... }]]
  //
  // to:
  // [
  //   [[{timestamp: N,... }, {timestamp: N,... }], [{timestamp: N,... }, {timestamp: N,... }]]
  //   [[{timestamp: M,... }, {timestamp: M,... }], [{timestamp: M,... }, {timestamp: M,... }]]
  // ]
  //
  // This makes it easy to sum across the groups of timestamps
  const bucketsProfitLoss = _.zip(..._.values(outcomesProfitLoss));

  return bucketsProfitLoss.map((bucketsProfitLoss: Array<Array<ProfitLossResult>>): ProfitLossResult => _.reduce(_.flatten(bucketsProfitLoss), (left: ProfitLossResult, right: ProfitLossResult) => sumProfitLossResults(left, right))!);
}

export async function getProfitLossSummary(db: Knex, augur: Augur, params: GetProfitLossSummaryParamsType): Promise<NumericDictionary<ProfitLossResult>> {
  const endTime = params.endTime || getCurrentTime();

  const result: NumericDictionary<ProfitLossResult> = {};
  for (const days of [1, 30]) {
    const periodInterval = days * 60 * 60 * 24;
    const startTime = endTime - periodInterval;

    const [startProfit, endProfit, ...rest] = await getProfitLoss(db, augur, {
      universe: params.universe,
      account: params.account,
      marketId: params.marketId,
      startTime,
      endTime,
      periodInterval,
    });

    if (rest.length !== 0) throw new Error("PL calculation in summary returning more thant two bucket");

    const negativeStartProfit: ProfitLossResult = {
      timestamp: startProfit.timestamp,
      marketId: startProfit.marketId,
      outcome: startProfit.outcome,
      netPosition: startProfit.netPosition.negated(),
      averagePrice: startProfit.averagePrice,
      realized: startProfit.realized.negated(),
      unrealized: startProfit.unrealized.negated(),
      total: startProfit.total.negated(),
      unrealizedCost: startProfit.unrealizedCost.negated(),
      realizedCost: startProfit.realizedCost.negated(),
      totalCost: startProfit.totalCost.negated(),
      realizedPercent: startProfit.realizedPercent,
      unrealizedPercent: startProfit.unrealizedPercent,
      totalPercent: startProfit.totalPercent,
      unrealizedRevenue: startProfit.unrealizedRevenue.negated(),
      frozenFunds: startProfit.frozenFunds.negated(),
      lastTradePrice: startProfit.lastTradePrice.negated(),
      lastTradePrice24hAgo: startProfit.lastTradePrice24hAgo.negated(),
      lastTradePrice24hChangePercent: startProfit.lastTradePrice24hChangePercent,
      unrealizedRevenue24hAgo: startProfit.unrealizedRevenue24hAgo.negated(),
      unrealizedRevenue24hChangePercent: startProfit.unrealizedRevenue24hChangePercent,
    };

    result[days] = sumProfitLossResults(endProfit, negativeStartProfit);
  }

  return result;
}

async function getLastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId(db: Knex, now: number, params: GetProfitLossParamsType): Promise<Dictionary<Dictionary<OutcomeValueTimeseries>>> {
  const lastTradePriceMinusMinPrice24hAgo = await queryOutcomeValueTimeseries(db, now, {
    ...params,
    startTime: null, // we need the lastTradePriceMinusMinPrice as of 24h ago, which might be a price arbitrarily old if an outcome hasn't been traded recently
    endTime: (params.endTime || now) - 86400, // endTime is a unix timestamp in seconds; 86400 is one day in seconds, ie. endTime should be one day prior to passed params.endTime
  });
  const lastTradePriceMinusMinPrice24hAgoByMarketId = _.groupBy(lastTradePriceMinusMinPrice24hAgo, (r) => r.marketId);
  const lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId: Dictionary<Dictionary<OutcomeValueTimeseries>> = _.reduce(lastTradePriceMinusMinPrice24hAgoByMarketId, (result, allPricesOneMarket, marketId) => {
    const allPricesOneMarketByOutcome = _.groupBy(allPricesOneMarket, (r) => r.outcome);
    const lastPrice24hAgoByOutcome = _.mapValues(allPricesOneMarketByOutcome, (allPricesForOneOutcome) => {
      let latestPrice = allPricesForOneOutcome[0];
      for (const price of allPricesForOneOutcome) {
        if (price.timestamp > latestPrice.timestamp) {
          latestPrice = price;
        }
      }
      return latestPrice;
    });
    result[marketId] = lastPrice24hAgoByOutcome;
    return result;
  }, {} as Dictionary<Dictionary<OutcomeValueTimeseries>>);
  return lastTradePriceMinusMinPrice24hAgoByOutcomeByMarketId;
}

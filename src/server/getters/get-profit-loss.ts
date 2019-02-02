import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { Dictionary, NumericDictionary } from "lodash";
import BigNumber from "bignumber.js";
import { Augur } from "augur.js";
import { getCurrentTime } from "../../blockchain/process-block";

import { ZERO } from "../../constants";
import {
  Address,
  } from "../../types";

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
    minPrice: ZERO,
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

export interface ProfitLossTimeseries extends Timestamped {
  account: Address;
  marketId: Address;
  outcome: number;
  transactionHash: string;
  price: BigNumber;
  position: BigNumber;
  numOutcomes: number;
  profit: BigNumber;
  minPrice: BigNumber,
}

export interface OutcomeValueTimeseries extends Timestamped {
  marketId: Address;
  outcome: number;
  value: BigNumber;
  transactionHash: string;
}

export interface ProfitLossResult extends Timestamped {
  netPosition: BigNumber;
  averagePrice: BigNumber;
  realized: BigNumber;
  unrealized: BigNumber;
  outcome: number;
  marketId: Address;
  total: BigNumber;
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
  const realized = left.realized.plus(right.realized);
  const unrealized = left.unrealized.plus(right.unrealized);
  const total = realized.plus(unrealized);
  const averagePrice = left.averagePrice.plus(right.averagePrice).dividedBy(2);

  return Object.assign(_.clone(left), {
    netPosition,
    realized,
    unrealized,
    total,
    averagePrice,
  });
}

async function queryProfitLossTimeseries(db: Knex, now: number, params: GetProfitLossParamsType): Promise<Array<ProfitLossTimeseries>> {
  const query = db("wcl_profit_loss_timeseries")
    .select("wcl_profit_loss_timeseries.*", "markets.universe", "markets.numOutcomes", "markets.minPrice")
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

function getProfitResultsForTimestamp(plsAtTimestamp: Array<ProfitLossTimeseries>, outcomeValuesAtTimestamp: Array<OutcomeValueTimeseries>|null): Array<ProfitLossResult> {
  const unsortedResults = plsAtTimestamp.map((outcomePl) => {
    const realized = outcomePl!.profit;
    const outcome = outcomePl!.outcome;
    const timestamp = outcomePl!.timestamp;
    const marketId = outcomePl!.marketId;
    let averagePrice = outcomePl!.price;
    const minPrice = outcomePl!.minPrice;
    const position = outcomePl!.position;

    let unrealized = ZERO;
    if (outcomeValuesAtTimestamp) {
      const outcomeValue = outcomeValuesAtTimestamp[outcome].value.minus(minPrice);
      const shareProfit = position.lt(ZERO) ? averagePrice.minus(outcomeValue) : outcomeValue.minus(averagePrice);
      unrealized = shareProfit.multipliedBy(position.abs());
    }

    // Adjust display for scalars
    averagePrice = averagePrice.plus(minPrice);

    const total = realized.plus(unrealized);

    return {
      timestamp,
      netPosition: position,
      realized,
      unrealized,
      total,
      averagePrice,
      outcome,
      marketId,
    };
  });
  return _.sortBy(unsortedResults, "outcome")!;
}

function getProfitResultsForMarket(marketPls: Array<Array<ProfitLossTimeseries>>, marketOutcomeValues: Array<Array<OutcomeValueTimeseries>>, buckets: Array<Timestamped>): Array<Array<ProfitLossResult>> {
  return _.map(marketPls, (outcomePLsAtTimestamp, timestampIndex) => {
    const nonZeroPositionOutcomePls = _.filter(outcomePLsAtTimestamp, (outcome) => !outcome.position.eq(ZERO));

    if (nonZeroPositionOutcomePls.length < 1) {
      return getProfitResultsForTimestamp(outcomePLsAtTimestamp, null);
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

    return getProfitResultsForTimestamp(outcomePLsAtTimestamp, sortedOutcomeValues);
  });
}

interface ProfitLossData {
  profits: Dictionary<Dictionary<Array<ProfitLossTimeseries>>>;
  outcomeValues: Dictionary<Dictionary<Array<OutcomeValueTimeseries>>>;
  buckets: Array<Timestamped>;
}

async function getProfitLossData(db: Knex, params: GetProfitLossParamsType): Promise<ProfitLossData> {
  const now = getCurrentTime();

  // Realized Profits + Timeseries data about the state of positions
  const profitsOverTime = await queryProfitLossTimeseries(db, now, params);
  const marketProfits = _.groupBy(profitsOverTime, (r) => r.marketId);
  const profits: Dictionary<Dictionary<Array<ProfitLossTimeseries>>> = _.reduce(marketProfits, (result, value, key) => {
    result[key] = _.groupBy(value, (r) => r.outcome );
    return result;
  }, {} as Dictionary<Dictionary<Array<ProfitLossTimeseries>>>);

  // Type there are no trades in this window then we'll return empty data
  if (_.isEmpty(profits))  {
    const buckets = bucketRangeByInterval(params.startTime || 0, params.endTime || now, params.periodInterval);
    return {profits: {}, outcomeValues: {}, buckets};
  }

  // The value of an outcome over time, for computing unrealized profit and loss at a time
  const outcomeValuesOverTime = await queryOutcomeValueTimeseries(db, now, params);
  const marketOutcomeValues = _.groupBy(outcomeValuesOverTime, (r) => r.marketId);
  const outcomeValues: Dictionary<Dictionary<Array<OutcomeValueTimeseries>>> = _.reduce(marketOutcomeValues, (result, value, key) => {
    result[key] = _.groupBy(value, (r) => r.outcome );
    return result;
  }, {} as Dictionary<Dictionary<Array<OutcomeValueTimeseries>>>);

  // The timestamps at which we need to return results
  const startTime = params.startTime || profitsOverTime[0].timestamp;
  const maxResultTime = Math.max(_.last(profitsOverTime)!.timestamp, _.last(outcomeValuesOverTime)!.timestamp);
  const endTime = Math.min(maxResultTime, now);
  const interval = params.periodInterval || null;
  const buckets = bucketRangeByInterval(startTime, endTime, interval);
  return {profits, outcomeValues, buckets};
}

export interface AllOutcomesProfitLoss {
  profit: Dictionary<Array<Array<ProfitLossResult>>>;
  buckets: Array<Timestamped>;
  marketOutcomes: Dictionary<number>;
}

export async function getAllOutcomesProfitLoss(db: Knex, params: GetProfitLossParamsType): Promise<AllOutcomesProfitLoss> {
  const { profits, outcomeValues, buckets } = await getProfitLossData(db, params);

  const bucketedProfits = _.mapValues(profits, (pls, marketId) => {
    return bucketAtTimestamps<ProfitLossTimeseries>(pls, buckets, Object.assign(getDefaultPLTimeseries(), { marketId }));
  });

  const bucketedOutcomeValues = _.mapValues(outcomeValues, (marketOutcomeValues) => {
    return bucketAtTimestamps<OutcomeValueTimeseries>(marketOutcomeValues, buckets, getDefaultOVTimeseries());
  });

  const profit = _.mapValues(bucketedProfits, (pls, marketId) => {
    return getProfitResultsForMarket(pls, bucketedOutcomeValues[marketId], buckets);
  });

  const marketOutcomes = _.fromPairs(_.values(_.mapValues(profits, (pls) => {
    const  first = _.first(_.first(_.values(pls)))!;
    return [first.marketId, first.numOutcomes];
  })));

  return {
    profit,
    marketOutcomes,
    buckets,
  };
}

export async function getProfitLoss(db: Knex, augur: Augur, params: GetProfitLossParamsType): Promise<Array<ProfitLossResult>> {
  const {profit: outcomesProfitLoss, buckets }  = await getAllOutcomesProfitLoss(db, params);
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
      netPosition: startProfit.netPosition.negated(),
      realized: startProfit.realized.negated(),
      unrealized: startProfit.unrealized.negated(),
      total: startProfit.total.negated(),
      averagePrice: startProfit.averagePrice,
      outcome: startProfit.outcome,
      marketId: startProfit.marketId,
    };

    result[days] = sumProfitLossResults(endProfit, negativeStartProfit);
  }

  return result;
}

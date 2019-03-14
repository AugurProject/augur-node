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
import { Percent, Price, Shares, Tokens } from "../../utils/dimension-quantity";
import { positionGetCurrentValue, positionGetRealizedProfitPercent, positionGetTotalCost, positionGetTotalProfit, positionGetTotalProfitPercent, positionGetUnrealizedCost, positionGetUnrealizedProfit, positionGetUnrealizedProfitPercent } from "../../utils/financial-math";

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

// TODO doc and move to types.ts
export interface ProfitLossTimeseries extends Timestamped, FrozenFunds {
  account: Address;
  marketId: Address;
  outcome: number;
  transactionHash: string;
  price: BigNumber;
  position: BigNumber;
  numOutcomes: number;
  profit: BigNumber;
  realizedCost: BigNumber;
  minPrice: BigNumber; // TODO what is this?
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
  netPosition: BigNumber; // current quantity of shares in user's position for this market outcome. "net" position because if user bought 4 shares and sold 6 shares, netPosition would be -2 shares (ie. 4 - 6 = -2). User is "long" this market outcome (gets paid if this outcome occurs) if netPosition is positive. User is "short" this market outcome (gets paid if this outcome does not occur) if netPosition is negative
  averagePrice: BigNumber; // average price per share user paid to be in this position -- TODO update with my latest understanding that averagePrice is reset each time you fully close a position, and otherwise is weighted average of buys and sells within current position
  realized: BigNumber; // realized profit in tokens (eg. ETH) user already got from this market outcome. "realized" means the user bought/sold shares in such a way that the profit is already in the user's wallet
  // TODO doc unrealized is based on current time / last traded price
  unrealized: BigNumber; // unrealized profit in tokens (eg. ETH) user could get from this market outcome. "unrealized" means the profit isn't in the user's wallet yet; the user could close the position to "realize" the profit, but instead is holding onto the shares. ProfitLossResult is currently not computed for each price change, so unrealized profit may be stale (not updated with latest share price).
  total: BigNumber; // total profit in tokens (eg. ETH). Always equal to realized + unrealized
  unrealizedCost: BigNumber;
  realizedCost: BigNumber;
  totalCost: BigNumber;
  realizedPercent: BigNumber; // TODO from 0 to 1, not 0 to 100
  unrealizedPercent: BigNumber; // TODO from 0 to 1, not 0 to 100
  totalPercent: BigNumber; // TODO from 0 to 1, not 0 to 100
  currentValue: BigNumber; // TODO doc currentValue = unrealized - frozenFunds
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

  // TODO new fields in sumProfitLossResults
  // TODO look in get-profit-loss for any other places that new fields need to be added

  const netPosition = leftPosition.plus(rightPosition);
  const realized = left.realized.plus(right.realized);
  const unrealized = left.unrealized.plus(right.unrealized);
  const total = realized.plus(unrealized);
  const averagePrice = left.averagePrice.plus(right.averagePrice).dividedBy(2); // TODO what is significance of dividing by 2 here?

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

function getProfitResultsForTimestamp(plsAtTimestamp: Array<ProfitLossTimeseries>, outcomeValuesAtTimestamp: Array<OutcomeValueTimeseries> | null): Array<ProfitLossResult> {
  const unsortedResults: Array<ProfitLossResult> = plsAtTimestamp.map((outcomePl) => {
    const realizedCost = new Tokens(outcomePl.realizedCost);
    const realizedProfit = new Tokens(outcomePl.profit);
    const outcome = outcomePl.outcome;
    const averagePerSharePriceToOpenPosition = new Price(outcomePl.price);
    const minPrice = new Price(outcomePl.minPrice);
    const netPosition = new Shares(outcomePl.position);
    const frozenFunds = new Tokens(outcomePl.frozenFunds);

    // averagePrice is average price per share user paid to open this position;
    // but, we want to display averagePrice; for scalar markets this means adding
    // minPrice. Eg. if a user paid an average price of 4.5 for a scalar market, but
    // the minPrice in that market is 3, we actually need to show 4.5+3=7.5 in the UI.
    const averagePriceDisplay: Price = averagePerSharePriceToOpenPosition.plus(minPrice);

    const lastPrice: Price | undefined = outcomeValuesAtTimestamp ? new Price(outcomeValuesAtTimestamp[outcome].value).minus(minPrice) : undefined;

    const unrealizedCost: Tokens = positionGetUnrealizedCost({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
    });
    const unrealizedProfit: Tokens = positionGetUnrealizedProfit({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
    });
    const totalCost: Tokens = positionGetTotalCost({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
      realizedCost,
    });
    const positionCurrentValue: Tokens = positionGetCurrentValue({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
      frozenFunds,
    });
    const totalProfit: Tokens = positionGetTotalProfit({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
      realizedProfit,
    });
    const realizedProfitPercent: Percent = positionGetRealizedProfitPercent({
      realizedCost,
      realizedProfit,
    });
    const unrealizedProfitPercent: Percent = positionGetUnrealizedProfitPercent({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
    });
    const totalProfitPercent: Percent = positionGetTotalProfitPercent({
      netPosition,
      averagePerSharePriceToOpenPosition,
      lastPrice,
      realizedCost,
      realizedProfit,
    });

    return {
      marketId: outcomePl.marketId,
      outcome,
      timestamp: outcomePl.timestamp,
      netPosition: netPosition.magnitude,
      realized: realizedProfit.magnitude,
      unrealized: unrealizedProfit.magnitude,
      total: totalProfit.magnitude,
      averagePrice: averagePriceDisplay.magnitude,
      unrealizedCost: unrealizedCost.magnitude,
      realizedCost: realizedCost.magnitude,
      totalCost: totalCost.magnitude,
      realizedPercent: realizedProfitPercent.magnitude,
      unrealizedPercent: unrealizedProfitPercent.magnitude,
      totalPercent: totalProfitPercent.magnitude,
      currentValue: positionCurrentValue.magnitude,
      frozenFunds: frozenFunds.magnitude,
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
    result[key] = _.groupBy(value, (r) => r.outcome);
    return result;
  }, {} as Dictionary<Dictionary<Array<ProfitLossTimeseries>>>);

  // Type there are no trades in this window then we'll return empty data
  if (_.isEmpty(profits)) {
    const buckets = bucketRangeByInterval(params.startTime || 0, params.endTime || now, params.periodInterval);
    return { profits: {}, outcomeValues: {}, buckets };
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
  return { profits, outcomeValues, buckets };
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
      totalPosition: ZERO, // TODO what is a totalPosition? and numEscrowed
      outcome: 0,
      netPosition: ZERO,
      marketId: "",
      unrealizedCost: ZERO,
      realizedCost: ZERO,
      totalCost: ZERO,
      realizedPercent: ZERO,
      unrealizedPercent: ZERO,
      totalPercent: ZERO,
      currentValue: ZERO, // TODO ??
      frozenFunds: ZERO,
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
      realizedPercent: ZERO, // TODO ?? need to decide how this is handled in sumProfitLossResults()
      unrealizedPercent: ZERO, // TODO ?? need to decide how this is handled in sumProfitLossResults()
      totalPercent: ZERO, // TODO ?? need to decide how this is handled in sumProfitLossResults()
      currentValue: startProfit.currentValue.negated(), // TODO
      frozenFunds: startProfit.frozenFunds.negated(),
    };

    result[days] = sumProfitLossResults(endProfit, negativeStartProfit);
  }

  return result;
}

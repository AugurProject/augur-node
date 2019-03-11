import { BigNumber } from "bignumber.js";
import { Percent, Price, Scalar, Shares, Tokens } from "./dimension-quantity";

const ZERO = new BigNumber(0);
const ZERO_SHARES = new Shares(ZERO);

// TODO unit test
// TODO doc
export function tradeGetQuantityClosed(prevPosition: Shares, positionDeltaFromTrade: Shares): Shares {
  if (positionDeltaFromTrade.isZero() || prevPosition.sign === positionDeltaFromTrade.sign) {
    return ZERO_SHARES;
  }
  return prevPosition.abs().min(positionDeltaFromTrade.abs());
}

// TODO doc ... averagePrice is what... as of when.... netPosition is interpreted how...
export function positionGetUnrealizedCost(netPosition: Shares, averagePerSharePriceToOpenPosition: Price): Tokens {
  return netPosition.abs().multipliedBy(averagePerSharePriceToOpenPosition).expect(Tokens);
}

// TODO doc eg. currentSharePrice might be lastPrice
export function positionGetProfitPerShare(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price): Price {
  if (netPosition.lt(Shares.sentinel)) {
    // netPosition is short, so user profits as currentSharePrice decreases
    return averagePerSharePriceToOpenPosition.minus(currentSharePrice);
  }
  // netPosition is long, so user profits as currentSharePrice increases
  return currentSharePrice.minus(averagePerSharePriceToOpenPosition);
}

// TODO doc
// TODO allow currentSharePrice to be undefined and return zero
export function positionGetUnrealizedProfit(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price | undefined): Tokens {
  if (currentSharePrice === undefined) {
    return Tokens.sentinel;
  }
  return positionGetProfitPerShare(netPosition, averagePerSharePriceToOpenPosition, currentSharePrice).multipliedBy(netPosition.abs()).expect(Tokens);
}

export function positionGetTotalProfit(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price | undefined,
  realizedProfit: Tokens): Tokens {
  return positionGetUnrealizedProfit(netPosition, averagePerSharePriceToOpenPosition, currentSharePrice).plus(realizedProfit);
}

// TODO doc
export function positionGetCurrentValue(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price | undefined,
  frozenFunds: Tokens): Tokens {
  return positionGetUnrealizedProfit(netPosition, averagePerSharePriceToOpenPosition, currentSharePrice).minus(frozenFunds);
}

// TODO doc, returns scale of 0..1
export function positionGetRealizedProfitPercent(realizedCost: Tokens, realizedProfit: Tokens): Percent {
  if (realizedCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider realizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.sentinel;
  }
  return ((realizedCost.plus(realizedProfit))
    .dividedBy(realizedCost)).expect(Percent)
    .minus(Scalar.ONE);
}

// TODO doc, returns scale of 0..1
export function positionGetUnrealizedProfitPercent(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price | undefined): Percent {
  // unrealizedProfitPercent is same formula as realizedProfitPercent
  return positionGetRealizedProfitPercent(
    positionGetUnrealizedCost(netPosition, averagePerSharePriceToOpenPosition),
    positionGetUnrealizedProfit(netPosition, averagePerSharePriceToOpenPosition, currentSharePrice));
}

// positionGetUnrealizedProfitPercent2() is for some clients
// who have unrealizedCost/unrealizedProfit, but lost the
// context to compute these from currentSharePrice/etc. Clients
// should default to positionGetUnrealizedProfitPercent() to
// avoid unnecessary derived state in the client's local scope.
export function positionGetUnrealizedProfitPercent2(unrealizedCost: Tokens, unrealizedProfit: Tokens): Percent {
  // unrealizedProfitPercent is same formula as realizedProfitPercent
  return positionGetRealizedProfitPercent(unrealizedCost, unrealizedProfit);
}

// TODO doc, returns scale of 0..1
export function positionGetTotalProfitPercent(
  netPosition: Shares,
  averagePerSharePriceToOpenPosition: Price,
  currentSharePrice: Price | undefined,
  realizedCost: Tokens,
  realizedProfit: Tokens): Percent {
  const unrealizedCost = positionGetUnrealizedCost(netPosition, averagePerSharePriceToOpenPosition);
  const totalCost = unrealizedCost.plus(realizedCost);
  if (totalCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider realizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.sentinel;
  }
  const unrealizedProfit = positionGetUnrealizedProfit(netPosition, averagePerSharePriceToOpenPosition, currentSharePrice);

  return ((totalCost.plus(unrealizedProfit).plus(realizedProfit))
    .dividedBy(totalCost)).expect(Percent)
    .minus(Scalar.ONE);
}

// positionGetTotalProfitPercent2() is for some clients
// who have unrealizedCost/unrealizedProfit, but lost the
// context to compute these from currentSharePrice/etc. Clients
// should default to positionGetTotalProfitPercent() to
// avoid unnecessary derived state in the client's local scope.
export function positionGetTotalProfitPercent2(
  // TODO consider making this object params.... four variables all of same type easy to mistype
  unrealizedCost: Tokens,
  unrealizedProfit: Tokens,
  realizedCost: Tokens,
  realizedProfit: Tokens): Percent {
  const totalCost = unrealizedCost.plus(realizedCost);
  if (totalCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider realizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.sentinel;
  }
  return ((totalCost.plus(unrealizedProfit).plus(realizedProfit))
    .dividedBy(totalCost)).expect(Percent)
    .minus(Scalar.ONE);
}

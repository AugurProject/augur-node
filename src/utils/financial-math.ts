import { Percent, Price, Shares, Tokens } from "./dimension-quantity";

// TODO instead of returning "Tokens", return "RealizedCost" from each function

// TODO doc how these param interfaces act as standard nomenclature/dictionary of nouns for financial math.

// TODO doc ... ie. current net position, or net position prior to the trade being processed.
interface NetPosition {
  netPosition: Shares;
}

// TODO doc
interface AveragePerSharePriceToOpenPosition {
  averagePerSharePriceToOpenPosition: Price;
}

// TODO doc... vs. trade quantity, and trade quantity closed
interface TradePositionDelta {
  tradePositionDelta: Shares;
}

// TODO explain how TradePrice works with scalars... this is minus minPrice, right? .... we should have something like f :: MarketListPrice -> MarketMinPrice -> TradePrice to codify this
interface TradePrice {
  tradePrice: Price;
}

// TODO doc
interface LastPrice {
  lastPrice: Price | undefined; // TODO explain lastPrice can be undefined because ...
}

// TODO doc
interface UnrealizedCost {
  unrealizedCost: Tokens;
}

// TODO doc
interface UnrealizedProfit {
  unrealizedProfit: Tokens;
}

// TODO doc
interface RealizedCost {
  realizedCost: Tokens;
}

// TODO doc
interface RealizedProfit {
  realizedProfit: Tokens;
}

// TODO doc
interface TotalCost {
  totalCost: Tokens;
}

// TODO doc
interface TotalProfit {
  totalProfit: Tokens;
}

// TODO doc
interface FrozenFunds {
  frozenFunds: Tokens;
}

enum PositionType {
  CLOSED = "closed",
  SHORT = "short",
  LONG = "long",
}

export function getPositionType(params: NetPosition): PositionType {
  if (params.netPosition.isZero()) {
    return PositionType.CLOSED;
  }
  if (params.netPosition.sign === -1) {
    return PositionType.SHORT;
  }
  return PositionType.LONG;
}

export function tradeGetNextNetPosition(params: NetPosition & TradePositionDelta): Shares {
  return params.netPosition.plus(params.tradePositionDelta);
}

export function tradeGetNextAveragePerSharePriceToOpenPosition(params: NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Price {
  const nextNetPosition = tradeGetNextNetPosition(params);
  if (nextNetPosition.isZero()) {
    // TODO doc
    return Price.ZERO;
  } else if (nextNetPosition.sign !== params.netPosition.sign) {
    // TODO doc
    return params.tradePrice;
  }
  const quantityOpened = tradeGetQuantityOpened(params);
  if (quantityOpened.isZero()) {
    // TODO doc
    return params.averagePerSharePriceToOpenPosition;
  }
  // TODO doc weighted average
  return (
    (params.netPosition.abs().multipliedBy(params.averagePerSharePriceToOpenPosition))
      .plus(params.tradePositionDelta.abs().multipliedBy(params.tradePrice))
  ).dividedBy(tradeGetNextNetPosition(params).abs()).expect(Price);
}

// TODO doc ie. netPosition prior to trade ... relationship between TradePositionDelta and TradeQuantityClosed
export function tradeGetQuantityClosed(params: NetPosition & TradePositionDelta): Shares {
  if (params.tradePositionDelta.isZero() ||
    params.tradePositionDelta.sign === params.netPosition.sign) {
    return Shares.ZERO;
  }
  return params.netPosition.abs().min(params.tradePositionDelta.abs());
}

// TODO doc ie. netPosition prior to trade ... relationship between TradePositionDelta and TradeQuantityOpened
export function tradeGetQuantityOpened(params: NetPosition & TradePositionDelta): Shares {
  // TODO simpler algorithm?
  if (params.tradePositionDelta.isZero()) {
    return Shares.ZERO;
  }
  if (params.tradePositionDelta.sign === params.netPosition.sign) {
    // position opened further
    return params.tradePositionDelta.abs();
  }
  if (params.tradePositionDelta.abs().gt(params.netPosition.abs())) {
    // position reversed
    return params.tradePositionDelta.plus(params.netPosition).abs();
  }
  // position partially or fully closed
  return Shares.ZERO;
}

// TODO doc ie. netPosition prior to trade
export function tradeGetRealizedCostDelta(params: NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Tokens {
  const positionType = getPositionType(params);
  if (positionType === PositionType.CLOSED) {
    return Tokens.ZERO;
  }
  const tradeQuantityClosed = tradeGetQuantityClosed(params);
  if (positionType === PositionType.SHORT) {
    // TODO doc
    return params.tradePrice.multipliedBy(tradeQuantityClosed).expect(Tokens);
  }
  // positionType is long
  // TODO doc
  return params.averagePerSharePriceToOpenPosition
    .multipliedBy(tradeQuantityClosed).expect(Tokens);
}

export function tradeGetNextRealizedCost(params: RealizedCost & NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Tokens {
  return params.realizedCost.plus(tradeGetRealizedCostDelta(params));
}

// TODO doc ie. netPosition prior to trade
export function tradeGetRealizedRevenueDelta(params: NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Tokens {
  const positionType = getPositionType(params);
  if (positionType === PositionType.CLOSED) {
    return Tokens.ZERO;
  }
  const tradeQuantityClosed = tradeGetQuantityClosed(params);
  if (positionType === PositionType.SHORT) {
    // TODO doc
    return params.averagePerSharePriceToOpenPosition
      .multipliedBy(tradeQuantityClosed).expect(Tokens);
  }
  // positionType is long
  // TODO doc
  return params.tradePrice.multipliedBy(tradeQuantityClosed).expect(Tokens);
}

export function tradeGetRealizedProfitDelta(params: NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Tokens {
  return tradeGetRealizedRevenueDelta(params).minus(tradeGetRealizedCostDelta(params));
}

export function tradeGetNextRealizedProfit(params: RealizedProfit & NetPosition & AveragePerSharePriceToOpenPosition & TradePositionDelta & TradePrice): Tokens {
  return params.realizedProfit.plus(tradeGetRealizedProfitDelta(params));
}

// TODO doc ie. netPosition prior to trade
export function positionGetUnrealizedCost(params: NetPosition & AveragePerSharePriceToOpenPosition & LastPrice): Tokens {
  switch (getPositionType(params)) {
    case PositionType.CLOSED:
      return Tokens.ZERO;
    case PositionType.SHORT:
      // TODO doc
      if (params.lastPrice === undefined) {
        return Tokens.ZERO;
      }
      return params.netPosition.abs().multipliedBy(params.lastPrice).expect(Tokens);
    case PositionType.LONG:
      // TODO doc
      return params.netPosition.abs()
        .multipliedBy(params.averagePerSharePriceToOpenPosition).expect(Tokens);
  }
}

// TODO doc
export function positionGetTotalCost(params: NetPosition & AveragePerSharePriceToOpenPosition & LastPrice & RealizedCost): Tokens {
  return positionGetUnrealizedCost(params).plus(params.realizedCost);
}

// TODO doc
// TODO allow currentSharePrice to be undefined and return zero
export function positionGetUnrealizedProfit(params: NetPosition & AveragePerSharePriceToOpenPosition & LastPrice): Tokens {
  if (params.lastPrice === undefined) {
    return Tokens.ZERO;
  }
  // TODO explain how this work for both long/short because -1 * -1 cancels out
  return params.netPosition.multipliedBy(
    params.lastPrice.minus(params.averagePerSharePriceToOpenPosition)).abs().expect(Tokens); // abs() prevents unrealized profit from appearing as "-0" on JSON.stringify()
}

export function positionGetTotalProfit(params: NetPosition & AveragePerSharePriceToOpenPosition & LastPrice & RealizedProfit): Tokens {
  return positionGetUnrealizedProfit(params).plus(params.realizedProfit);
}

// TODO doc
export function positionGetCurrentValue(params: NetPosition & AveragePerSharePriceToOpenPosition & LastPrice & FrozenFunds): Tokens {
  return positionGetUnrealizedProfit(params).minus(params.frozenFunds);
}

// TODO doc, returns scale of 0..1
export function positionGetRealizedProfitPercent(params: RealizedCost & RealizedProfit): Percent {
  if (params.realizedCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider realizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.ZERO;
  }
  return params.realizedProfit.dividedBy(params.realizedCost).expect(Percent);
}

// TODO doc, returns scale of 0..1 ... clients should default to providing netposition/etc. instead of passing unrealizedCost/unraelizedProfit, to minimize derived state in the client's local scope and maximize computations done safely in this library. But, some clients don't have access to LastPrice/etc. and that's why we support passing unrealizedCost/unrealizedProfit.
export function positionGetUnrealizedProfitPercent(params:
  (NetPosition & AveragePerSharePriceToOpenPosition & LastPrice)
  | (UnrealizedCost & UnrealizedProfit)): Percent {
  const unrealizedCost = "unrealizedCost" in params ? params.unrealizedCost : positionGetUnrealizedCost(params);
  if (unrealizedCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider unrealizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.ZERO;
  }
  const unrealizedProfit = "unrealizedProfit" in params ? params.unrealizedProfit : positionGetUnrealizedProfit(params);
  return unrealizedProfit.dividedBy(unrealizedCost).expect(Percent);
}

// TODO doc, returns scale of 0..1
export function positionGetTotalProfitPercent(params:
  (NetPosition & AveragePerSharePriceToOpenPosition & LastPrice & RealizedCost & RealizedProfit)
  | (TotalCost & TotalProfit)): Percent {
  const totalCost = "totalCost" in params ? params.totalCost : positionGetTotalCost(params);
  if (totalCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider totalProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return Percent.ZERO;
  }
  const totalProfit = "totalProfit" in params ? params.totalProfit : positionGetTotalProfit(params);
  return totalProfit.dividedBy(totalCost).expect(Percent);
}

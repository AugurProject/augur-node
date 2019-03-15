import { Percent, Price, Shares, Tokens } from "./dimension-quantity";

// TODO it's probably unnecessary to document the functions so long as the I/O types are documented

// TODO doc ... ie. current net position, or net position prior to the trade being processed.
interface NetPosition {
  netPosition: Shares;
}

// TODO doc
interface NextNetPosition {
  nextNetPosition: Shares;
}

// TODO doc
interface AveragePricePerShareToOpenPosition {
  averagePricePerShareToOpenPosition: Price;
}

// TODO doc
interface NextAveragePricePerShareToOpenPosition {
  nextAveragePricePerShareToOpenPosition: Price;
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
interface UnrealizedProfitPercent {
  unrealizedProfitPercent: Percent;
}

// TODO doc
interface RealizedCost {
  realizedCost: Tokens;
}

// TODO doc
interface NextRealizedCost {
  nextRealizedCost: Tokens;
}

// TODO doc
interface RealizedProfit {
  realizedProfit: Tokens;
}

// TODO doc
interface NextRealizedProfit {
  nextRealizedProfit: Tokens;
}

// TODO doc
interface RealizedProfitPercent {
  realizedProfitPercent: Percent;
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
interface TotalProfitPercent {
  totalProfitPercent: Percent;
}

// TODO doc
interface CurrentValue {
  currentValue: Tokens;
}

// TODO doc
interface FrozenFunds {
  frozenFunds: Tokens;
}

// TODO doc... vs. trade quantity, and trade quantity closed
interface TradePositionDelta {
  tradePositionDelta: Shares;
}

// TODO doc
interface TradeQuantityClosed { // TODO rename QuantityClosed?
  tradeQuantityClosed: Shares;
}

// TODO doc
interface TradeQuantityOpened { // TODO rename QuantityOpened?
  tradeQuantityOpened: Shares;
}

// TODO explain how TradePrice works with scalars... this is minus minPrice, right? .... we should have something like f :: MarketListPrice -> MarketMinPrice -> TradePrice to codify this
interface TradePrice {
  tradePrice: Price;
}

// TODO doc
interface TradeRealizedCostDelta {
  tradeRealizedCostDelta: Tokens;
}

// TODO doc
interface TradeRealizedRevenueDelta {
  tradeRealizedRevenueDelta: Tokens;
}

// TODO doc
interface TradeRealizedProfitDelta {
  tradeRealizedProfitDelta: Tokens;
}

// TODO doc
interface LastPrice {
  lastPrice: Price | undefined; // TODO explain lastPrice can be undefined because ...
}

// TODO doc
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

export function getNextNetPosition(params: NetPosition & TradePositionDelta): NextNetPosition {
  return {
    nextNetPosition: params.netPosition.plus(params.tradePositionDelta),
  };
}

export function getNextAveragePricePerShareToOpenPosition(params: NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): NextAveragePricePerShareToOpenPosition {
  const { nextNetPosition } = getNextNetPosition(params);
  if (nextNetPosition.isZero()) {
    // TODO doc
    return { nextAveragePricePerShareToOpenPosition: Price.ZERO };
  } else if (nextNetPosition.sign !== params.netPosition.sign) {
    // TODO doc
    return { nextAveragePricePerShareToOpenPosition: params.tradePrice };
  }
  const { tradeQuantityOpened } = getTradeQuantityOpened(params);
  if (tradeQuantityOpened.isZero()) {
    // TODO doc
    return { nextAveragePricePerShareToOpenPosition: params.averagePricePerShareToOpenPosition };
  }
  // TODO doc weighted average
  return {
    nextAveragePricePerShareToOpenPosition: (
      (params.netPosition.abs()
        .multipliedBy(params.averagePricePerShareToOpenPosition))
        .plus(params.tradePositionDelta.abs().multipliedBy(params.tradePrice))
    ).dividedBy(nextNetPosition.abs()).expect(Price),
  };
}

// TODO doc ie. netPosition prior to trade ... relationship between TradePositionDelta and TradeQuantityClosed
export function getTradeQuantityClosed(params: NetPosition & TradePositionDelta): TradeQuantityClosed {
  if (params.tradePositionDelta.isZero() ||
    params.tradePositionDelta.sign === params.netPosition.sign) {
    return { tradeQuantityClosed: Shares.ZERO };
  }
  return { tradeQuantityClosed: params.netPosition.abs().min(params.tradePositionDelta.abs()) };
}

// TODO doc ie. netPosition prior to trade ... relationship between TradePositionDelta and TradeQuantityOpened
export function getTradeQuantityOpened(params: NetPosition & TradePositionDelta): TradeQuantityOpened {
  if (params.tradePositionDelta.isZero()) {
    return { tradeQuantityOpened: Shares.ZERO };
  } else if (params.tradePositionDelta.sign === params.netPosition.sign) {
    return { tradeQuantityOpened: params.tradePositionDelta.abs() }; // position opened further
  } else if (params.tradePositionDelta.abs().gt(params.netPosition.abs())) {
    return { tradeQuantityOpened: params.tradePositionDelta.plus(params.netPosition).abs() }; // position reversed
  }
  return { tradeQuantityOpened: Shares.ZERO }; // position partially or fully closed
}

// TODO doc ie. netPosition prior to trade
export function getTradeRealizedCostDelta(params: NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): TradeRealizedCostDelta {
  const positionType = getPositionType(params);
  if (positionType === PositionType.CLOSED) {
    return { tradeRealizedCostDelta: Tokens.ZERO };
  }
  const { tradeQuantityClosed } = getTradeQuantityClosed(params);
  if (positionType === PositionType.SHORT) {
    // TODO doc
    return { tradeRealizedCostDelta: params.tradePrice.multipliedBy(tradeQuantityClosed).expect(Tokens) };
  }
  // positionType is long
  // TODO doc
  return {
    tradeRealizedCostDelta: params.averagePricePerShareToOpenPosition
      .multipliedBy(tradeQuantityClosed).expect(Tokens),
  };
}

export function getNextRealizedCost(params: RealizedCost & NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): NextRealizedCost {
  return {
    nextRealizedCost: params.realizedCost
      .plus(getTradeRealizedCostDelta(params).tradeRealizedCostDelta),
  };
}

// TODO doc ie. netPosition prior to trade
export function getTradeRealizedRevenueDelta(params: NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): TradeRealizedRevenueDelta {
  const positionType = getPositionType(params);
  if (positionType === PositionType.CLOSED) {
    return { tradeRealizedRevenueDelta: Tokens.ZERO };
  }
  const { tradeQuantityClosed } = getTradeQuantityClosed(params);
  if (positionType === PositionType.SHORT) {
    // TODO doc
    return {
      tradeRealizedRevenueDelta: params.averagePricePerShareToOpenPosition
        .multipliedBy(tradeQuantityClosed).expect(Tokens),
    };
  }
  // positionType is long
  // TODO doc
  return { tradeRealizedRevenueDelta: params.tradePrice.multipliedBy(tradeQuantityClosed).expect(Tokens) };
}

export function getTradeRealizedProfitDelta(params: NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): TradeRealizedProfitDelta {
  return {
    tradeRealizedProfitDelta: getTradeRealizedRevenueDelta(params).tradeRealizedRevenueDelta
      .minus(getTradeRealizedCostDelta(params).tradeRealizedCostDelta),
  };
}

export function getNextRealizedProfit(params: RealizedProfit & NetPosition & AveragePricePerShareToOpenPosition & TradePositionDelta & TradePrice): NextRealizedProfit {
  return {
    nextRealizedProfit: params.realizedProfit
      .plus(getTradeRealizedProfitDelta(params).tradeRealizedProfitDelta),
  };
}

// TODO doc ie. netPosition prior to trade
export function getUnrealizedCost(params: NetPosition & AveragePricePerShareToOpenPosition & LastPrice): UnrealizedCost {
  switch (getPositionType(params)) {
    case PositionType.CLOSED:
      return { unrealizedCost: Tokens.ZERO };
    case PositionType.SHORT:
      // TODO doc
      if (params.lastPrice === undefined) {
        return { unrealizedCost: Tokens.ZERO };
      }
      return { unrealizedCost: params.netPosition.abs().multipliedBy(params.lastPrice).expect(Tokens) };
    case PositionType.LONG:
      // TODO doc
      return {
        unrealizedCost: params.netPosition.abs()
          .multipliedBy(params.averagePricePerShareToOpenPosition).expect(Tokens),
      };
  }
}

// TODO doc
export function getTotalCost(params: NetPosition & AveragePricePerShareToOpenPosition & LastPrice & RealizedCost): TotalCost {
  return { totalCost: getUnrealizedCost(params).unrealizedCost.plus(params.realizedCost) };
}

// TODO doc
// TODO allow currentSharePrice to be undefined and return zero
export function getUnrealizedProfit(params: NetPosition & AveragePricePerShareToOpenPosition & LastPrice): UnrealizedProfit {
  if (params.lastPrice === undefined) {
    return { unrealizedProfit: Tokens.ZERO };
  }
  // TODO explain how this work for both long/short because -1 * -1 cancels out
  return {
    unrealizedProfit: params.netPosition.multipliedBy(
      params.lastPrice.minus(params.averagePricePerShareToOpenPosition)).abs().expect(Tokens), // abs() prevents unrealized profit from appearing as "-0" on JSON.stringify()
  };
}

export function getTotalProfit(params: NetPosition & AveragePricePerShareToOpenPosition & LastPrice & RealizedProfit): TotalProfit {
  return {
    totalProfit: getUnrealizedProfit(params).unrealizedProfit
      .plus(params.realizedProfit),
  };
}

// TODO doc
export function getCurrentValue(params: NetPosition & AveragePricePerShareToOpenPosition & LastPrice & FrozenFunds): CurrentValue {
  return {
    currentValue: getUnrealizedProfit(params).unrealizedProfit
      .minus(params.frozenFunds),
  };
}

// TODO doc, returns scale of 0..1
export function getRealizedProfitPercent(params: RealizedCost & RealizedProfit): RealizedProfitPercent {
  if (params.realizedCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider realizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return { realizedProfitPercent: Percent.ZERO };
  }
  return {
    realizedProfitPercent: params.realizedProfit.dividedBy(params.realizedCost).expect(Percent),
  };
}

// TODO doc, returns scale of 0..1 ... clients should default to providing netposition/etc. instead of passing unrealizedCost/unraelizedProfit, to minimize derived state in the client's local scope and maximize computations done safely in this library. But, some clients don't have access to LastPrice/etc. and that's why we support passing unrealizedCost/unrealizedProfit.
export function getUnrealizedProfitPercent(params:
  (NetPosition & AveragePricePerShareToOpenPosition & LastPrice)
  | (UnrealizedCost & UnrealizedProfit)): UnrealizedProfitPercent {
  const { unrealizedCost } = "unrealizedCost" in params ? params : getUnrealizedCost(params);
  if (unrealizedCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider unrealizedProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return { unrealizedProfitPercent: Percent.ZERO };
  }
  const { unrealizedProfit } = "unrealizedProfit" in params ? params : getUnrealizedProfit(params);
  return {
    unrealizedProfitPercent: unrealizedProfit.dividedBy(unrealizedCost).expect(Percent),
  };
}

// TODO doc, returns scale of 0..1
export function getTotalProfitPercent(params:
  (NetPosition & AveragePricePerShareToOpenPosition & LastPrice & RealizedCost & RealizedProfit)
  | (TotalCost & TotalProfit)): TotalProfitPercent {
  const { totalCost } = "totalCost" in params ? params : getTotalCost(params);
  if (totalCost.isZero()) {
    // user spent nothing and so can't have a percent profit on
    // nothing; we might consider totalProfitPercent to be
    // undefined, but instead we return zero for convenience.
    return { totalProfitPercent: Percent.ZERO };
  }
  const { totalProfit } = "totalProfit" in params ? params : getTotalProfit(params);
  return { totalProfitPercent: totalProfit.dividedBy(totalCost).expect(Percent) };
}

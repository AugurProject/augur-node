import { Percent, Price, Shares, Tokens } from "./dimension-quantity";

// This library is intended to be a home for all augur financial formulas.
// The emphasis is on safety and education with mechanisms like more specific
// types (eg. Shares instead of BigNumber), named parameters/return values
// (eg. returning a TradeQuantityOpened instead of Shares), and highly
// structured nouns (eg. passing around a RealizedProfit instead of Tokens).

// The documentation is centered around the types, the idea
// being that financial formuals are mostly self-documenting
// given time spent understanding the input and output types.

// NetPosition is the number of shares a user currently owns in a market
// outcome. If NetPosition is positive (negative), the user has a "long"
// ("short") position and earns money if the price goes up (down). If NetPosition
// is zero the position is said to be "closed". In the context of a trade,
// NetPosition is prior to the trade being processed, see NextNetPosition.
interface NetPosition {
  netPosition: Shares;
}

// TODO doc
interface NextNetPosition {
  nextNetPosition: Shares;
}

// TODO doc NB this average is based on TradePriceMinusMinPrice... see note on TradePriceMinusMinPrice ... not to be confused with SharePrice
interface AverageTradePriceMinusMinPriceForOpenPosition {
  averageTradePriceMinusMinPriceForOpenPosition: Price;
}

// TODO doc
interface NextAverageTradePriceMinusMinPriceForOpenPosition {
  nextAverageTradePriceMinusMinPriceForOpenPosition: Price;
}

// TODO doc
interface UnrealizedCost {
  unrealizedCost: Tokens;
}

interface UnrealizedRevenue {
  unrealizedRevenue: Tokens;
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

// TODO doc... vs. trade quantity, and trade quantity closed
interface TradePositionDelta {
  tradePositionDelta: Shares;
}

// TODO doc
interface TradeQuantityClosed {
  tradeQuantityClosed: Shares;
}

// TODO doc
interface TradeQuantityOpened {
  tradeQuantityOpened: Shares;
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

// TODO doc ... wcl_profit_loss_timeseries.price is of this type ... vs TradePrice, LastPrice, SharePrice
interface TradePriceMinusMinPrice {
  tradePriceMinusMinPrice: Price;
}

// TODO doc
interface TradePrice {
  tradePrice: Price;
}

// TODO doc ... some formulas should be using SharePrice instead of TradePriceMinusMinPrice ... ... same for open/close position... price paid or received for shares with this type of position ... NB this isn't "minus min price"... this is the actual price paid/received
interface SharePrice {
  sharePrice: Price;
}

// TODO doc ... vs TradePrice
interface LastPrice {
  lastPrice: Price | undefined; // TODO explain lastPrice can be undefined because ...
}

// TODO doc
interface MarketMinPrice {
  marketMinPrice: Price;
}

// TODO doc
interface MarketMaxPrice {
  marketMaxPrice: Price;
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

export function getTradePrice(params: MarketMinPrice & TradePriceMinusMinPrice): TradePrice {
  return {
    tradePrice: params.marketMinPrice.plus(params.tradePriceMinusMinPrice),
  };
}

export function getTradePriceMinusMinPrice(params: MarketMinPrice & TradePrice): TradePriceMinusMinPrice {
  return {
    tradePriceMinusMinPrice: params.tradePrice.minus(params.marketMinPrice),
  };
}

export function getSharePriceForPosition(params: MarketMinPrice & MarketMaxPrice & NetPosition & TradePriceMinusMinPrice): SharePrice {
  // For example, in a scalar market with marketMinPrice=20, marketMaxPrice=25,
  // and tradePrice=22, the sharePrice for a long position is 2 Tokens/Share
  // (ie. tradePrice-marketMinPrice = 22-20 = 2), and for a short position
  // is 3 Tokens/Share (ie. marketMaxPrice-tradePrice = 25-22 = 3)
  switch (getPositionType(params)) {
    case PositionType.CLOSED:
      return { sharePrice: Price.ZERO };
    case PositionType.SHORT:
      return {
        sharePrice: params.marketMaxPrice.minus(getTradePrice(params).tradePrice),
      };
    case PositionType.LONG:
      return {
        sharePrice: params.tradePriceMinusMinPrice,
      };
  }
}

export function getNextNetPosition(params: NetPosition & TradePositionDelta): NextNetPosition {
  return {
    nextNetPosition: params.netPosition.plus(params.tradePositionDelta),
  };
}

export function getNextAverageTradePriceMinusMinPriceForOpenPosition(params: NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & TradePositionDelta & TradePriceMinusMinPrice): NextAverageTradePriceMinusMinPriceForOpenPosition {
  const { nextNetPosition } = getNextNetPosition(params);
  if (nextNetPosition.isZero()) {
    // TODO doc
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: Price.ZERO };
  } else if (nextNetPosition.sign !== params.netPosition.sign) {
    // TODO doc
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: params.tradePriceMinusMinPrice };
  }
  const { tradeQuantityOpened } = getTradeQuantityOpened(params);
  if (tradeQuantityOpened.isZero()) {
    // TODO doc
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: params.averageTradePriceMinusMinPriceForOpenPosition };
  }
  // invariant: tradeQuantityOpened == tradePositionDelta, ie. position opened further
  // TODO doc weighted average
  return {
    nextAverageTradePriceMinusMinPriceForOpenPosition: (
      (params.netPosition.abs()
        .multipliedBy(params.averageTradePriceMinusMinPriceForOpenPosition))
        .plus(params.tradePositionDelta.abs().multipliedBy(params.tradePriceMinusMinPrice))
    ).dividedBy(nextNetPosition.abs()).expect(Price),
  };
}

export function getTradeQuantityClosed(params: NetPosition & TradePositionDelta): TradeQuantityClosed {
  if (params.tradePositionDelta.isZero() ||
    params.tradePositionDelta.sign === params.netPosition.sign) {
    return { tradeQuantityClosed: Shares.ZERO };
  }
  return { tradeQuantityClosed: params.netPosition.abs().min(params.tradePositionDelta.abs()) };
}

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

export function getTradeRealizedCostDelta(params: MarketMinPrice & MarketMaxPrice & NetPosition & TradePositionDelta & AverageTradePriceMinusMinPriceForOpenPosition): TradeRealizedCostDelta {
  const { sharePrice } = getSharePriceForPosition({
    ...params,
    // the user has closed `tradeQuantityClosed` number of shares at some
    // price X; this function doesn't care about price X; we are computing
    // _cost_, which is what the user previously paid to open this position,
    // that's why we use averageTradePriceMinusMinPriceForOpenPosition.
    tradePriceMinusMinPrice: params.averageTradePriceMinusMinPriceForOpenPosition,
  });
  const { tradeQuantityClosed } = getTradeQuantityClosed(params);
  return {
    tradeRealizedCostDelta: sharePrice.multipliedBy(tradeQuantityClosed).expect(Tokens),
  };
}

export function getNextRealizedCost(params: MarketMinPrice & MarketMaxPrice & RealizedCost & NetPosition & TradePositionDelta & AverageTradePriceMinusMinPriceForOpenPosition): NextRealizedCost {
  const { tradeRealizedCostDelta } = getTradeRealizedCostDelta(params);
  return {
    nextRealizedCost: params.realizedCost.plus(tradeRealizedCostDelta),
  };
}

export function getTradeRealizedRevenueDelta(params: MarketMinPrice & MarketMaxPrice & NetPosition & TradePositionDelta & TradePriceMinusMinPrice): TradeRealizedRevenueDelta {
  const { sharePrice } = getSharePriceForPosition(params);
  const { tradeQuantityClosed } = getTradeQuantityClosed(params);
  return {
    tradeRealizedRevenueDelta: sharePrice.multipliedBy(tradeQuantityClosed).expect(Tokens),
  };
}

export function getTradeRealizedProfitDelta(params: MarketMinPrice & MarketMaxPrice & NetPosition & TradePositionDelta & AverageTradePriceMinusMinPriceForOpenPosition & TradePriceMinusMinPrice): TradeRealizedProfitDelta {
  const { tradeRealizedRevenueDelta } = getTradeRealizedRevenueDelta(params);
  const { tradeRealizedCostDelta } = getTradeRealizedCostDelta(params);
  return {
    tradeRealizedProfitDelta: tradeRealizedRevenueDelta.minus(tradeRealizedCostDelta),
  };
}

export function getNextRealizedProfit(params: RealizedProfit & MarketMinPrice & MarketMaxPrice & NetPosition & TradePositionDelta & AverageTradePriceMinusMinPriceForOpenPosition & TradePriceMinusMinPrice): NextRealizedProfit {
  const { tradeRealizedProfitDelta } = getTradeRealizedProfitDelta(params);
  return {
    nextRealizedProfit: params.realizedProfit.plus(tradeRealizedProfitDelta),
  };
}

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

export function getUnrealizedCost(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition): UnrealizedCost {
  const { sharePrice } = getSharePriceForPosition({
    ...params,
    // user has an open position; we are computing _cost_, which is
    // what the user previously paid to open this position, that's
    // why we use averageTradePriceMinusMinPriceForOpenPosition.
    tradePriceMinusMinPrice: params.averageTradePriceMinusMinPriceForOpenPosition,
  });
  return {
    unrealizedCost: sharePrice.multipliedBy(params.netPosition.abs()).expect(Tokens),
  };
}

export function getUnrealizedRevenue(params: MarketMinPrice & MarketMaxPrice & NetPosition & LastPrice): UnrealizedRevenue {
  if (params.lastPrice === undefined) {
    // lastPrice is undefined (ie. unavailable for some reason); we might consider
    // unrealizedRevenue to be undefined, but instead we return zero for convenience.
    return { unrealizedRevenue: Tokens.ZERO };
  }
  const { sharePrice } = getSharePriceForPosition({
    ...params,
    // user has an open position; we are computing potential revenue user would get
    // if they fully closed the position at LastPrice, that's why we use LastPrice.
    tradePriceMinusMinPrice: params.lastPrice,
  });
  return {
    unrealizedRevenue: sharePrice.multipliedBy(params.netPosition.abs()).expect(Tokens),
  };
}

export function getUnrealizedProfit(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastPrice): UnrealizedProfit {
  const { unrealizedRevenue } = getUnrealizedRevenue(params);
  const { unrealizedCost } = getUnrealizedCost(params);
  return {
    unrealizedProfit: unrealizedRevenue.minus(unrealizedCost),
  };
}

// TODO doc clients should default to providing netposition/etc. instead of passing unrealizedCost/unraelizedProfit, to minimize derived state in the client's local scope and maximize computations done safely in this library. But, some clients don't have access to LastPrice/etc. and that's why we support passing unrealizedCost/unrealizedProfit.
export function getUnrealizedProfitPercent(params:
  (MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastPrice)
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

export function getTotalCost(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & RealizedCost): TotalCost {
  const { unrealizedCost } = getUnrealizedCost(params);
  return {
    totalCost: unrealizedCost.plus(params.realizedCost),
  };
}

export function getTotalProfit(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastPrice & RealizedProfit): TotalProfit {
  const { unrealizedProfit } = getUnrealizedProfit(params);
  return {
    totalProfit: unrealizedProfit.plus(params.realizedProfit),
  };
}

// TODO explain multiple param sets
export function getTotalProfitPercent(params:
  (MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastPrice & RealizedCost & RealizedProfit)
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

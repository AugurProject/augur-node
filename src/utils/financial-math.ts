import { Percent, Price, Shares, Tokens } from "./dimension-quantity";

// This library is intended to be a home for all augur financial formulas.
// The emphasis is on safety and education with mechanisms like more specific
// types (eg. Shares instead of BigNumber), named parameters/return values
// (eg. returning a TradeQuantityOpened instead of Shares), and highly
// structured nouns (eg. passing around a RealizedProfit instead of Tokens).

// The documentation is centered around the types, the idea
// being that financial formuals are mostly self-documenting
// given time spent understanding the input and output types.

// The docs below describe many values as being in the context of one market
// outcome. Usually this is highest resolution / most specific data available-- eg.
// we have a user's TotalCost computed for a categorical outcome A, and a different
// TotalCost for outcome B. But, TotalCost and other values can also be expressed as
// rollups/aggregations, for example TotalCost of a user's entire Augur portfolio.

// PositionType is the type of a user's investment position in an Augur market.
// A position is scoped to one market outcome. For example in a categorical
// market if a user bought shares of A and later bought shares of B, these
// are two distinct positions. A position is said to be "closed" if the user
// has no shares in that outcome. A position is said to be "long" ("short") if
// the user earns money when the price of an outcome's shares goes up (down).
enum PositionType {
  CLOSED = "closed",
  SHORT = "short",
  LONG = "long",
}

// NetPosition is the number of shares a user currently owns in a market
// outcome. If NetPosition is positive (negative), the user has a "long"
// ("short") position and earns money if the price goes up (down). If NetPosition
// is zero the position is said to be "closed". In the context of a trade,
// NetPosition is prior to the trade being processed, see NextNetPosition.
interface NetPosition {
  netPosition: Shares;
}

// NextNetPosition is, in the context of a trade, a user's NetPosition after
// processing that trade. NetPosition is prior to the trade being processed.
interface NextNetPosition {
  nextNetPosition: Shares;
}

// AverageTradePriceMinusMinPriceForOpenPosition is the average
// per-share trade price at which the user opened their position. For
// technical reasons this average includes subtraction of MarketMinPrice
// (ie. an average of TradePriceMinusMinPrice, not TradePrice). This
// is a _trade price_ average, not to be confused with SharePrice.
interface AverageTradePriceMinusMinPriceForOpenPosition {
  averageTradePriceMinusMinPriceForOpenPosition: Price;
}

// NextAverageTradePriceMinusMinPriceForOpenPosition is, in the context of
// a trade, a user's AverageTradePriceMinusMinPriceForOpenPosition after
// processing that trade. AverageTradePriceMinusMinPriceForOpenPosition
// is prior to the trade being processed.
interface NextAverageTradePriceMinusMinPriceForOpenPosition {
  nextAverageTradePriceMinusMinPriceForOpenPosition: Price;
}

// UnrealizedCost is the amount of tokens a user paid to open their current
// NetPosition in that market outcome. NB UnrealizedCost is a cashflow amount that
// the user remitted based on SharePrice not TradePrice. For example if you open
// a short position for one share in a binary market at a trade price of 0.2, then
// your UnrealizedCost is `MarketMaxPrice=1.0 - TradePrice=0.2 --> SharePrice=0.8
// * 1 share --> UnrealizedCost=0.8``. NB also that in categorical markets the
// user may pay shares of other outcomes in lieu of tokens, which doesn't change
// the calculation for UnrealizedCost, but it does mean that (in a categorical
// market) UnrealizedCost may be greater than the actual tokens a user remitted.
interface UnrealizedCost {
  unrealizedCost: Tokens;
}

// UnrealizedRevenue is the amount of tokens a user would receive for
// their current NetPosition if they were to close that position at the
// last price for that market outcome. The last price is the most recent
// price paid by anyone trading on that outcome. For example if a user has
// a long position of 10 shares in a binary market, and the last price is
// 0.75, then `NetPosition=10 * LastPrice=0.75 --> UnrealizedRevenue=7.5`.
interface UnrealizedRevenue {
  unrealizedRevenue: Tokens;
}

// UnrealizedProfit is the profit a user would make on just their current
// NetPosition if they were to close it at the last price for that market
// outcome. The last price is the most recent price paid by anyone trading on
// that outcome. UnrealizedProfit is UnrealizedRevenue minus UnrealizedCost.
interface UnrealizedProfit {
  unrealizedProfit: Tokens;
}

// UnrealizedProfitPercent is the percent profit a user would have on just their
// current NetPosition if they were to close it at the last price for that market
// outcome. The last price is the most recent price paid by anyone trading on that
// outcome. UnrealizedProfitPercent is UnrealizedProfit divided by UnrealizedCost.
interface UnrealizedProfitPercent {
  unrealizedProfitPercent: Percent;
}

// RealizedCost is the amount of tokens a user paid for the total historical cost
// to open all positions which have _since been closed_ for that market outcome. Ie.
// RealizedCost is accrued cost for shares a user previously owned. NB RealizedCost
// is a cashflow amount that the user remitted based on SharePrice not TradePrice.
// For example if you open a short position for one share in a binary market at
// a trade price of 0.2, and then close that position so the cost is realized,
// your RealizedCost is `MarketMaxPrice=1.0 - TradePrice=0.2 --> SharePrice=0.8
// * 1 share --> RealizedCost=0.8`. NB also that in categorical markets the
// user may pay shares of other outcomes in lieu of tokens, which doesn't change
// the calculation for RealizedCost, but it does mean that (in a categorical
// market) RealizedCost may be greater than the actual tokens a user remitted.
interface RealizedCost {
  realizedCost: Tokens;
}

// NextRealizedCost is, in the context of a trade, a user's RealizedCost after
// processing that trade. RealizedCost is prior to the trade being processed.
interface NextRealizedCost {
  nextRealizedCost: Tokens;
}

// RealizedProfit is the profit a user made for total historical
// positions which have _since been closed_ in a market outcome. Ie.
// RealizedProfit is accrued profit for shares a user previously owned.
interface RealizedProfit {
  realizedProfit: Tokens;
}

// NextRealizedProfit is, in the context of a trade, a user's RealizedProfit after
// processing that trade. RealizedProfit is prior to the trade being processed.
interface NextRealizedProfit {
  nextRealizedProfit: Tokens;
}

// RealizedProfitPercent is the percent profit a user made for total
// historical positions which have _since been closed_ in a market outcome. Ie.
// RealizedProfitPercent is accrued profit percent for shares a user previously
// owned. RealizedProfitPercent is RealizedProfit divided by RealizedCost.
interface RealizedProfitPercent {
  realizedProfitPercent: Percent;
}

// TotalCost is UnrealizedCost plus RealizedCost. Ie. TotalCost is
// the cashflow amount the user remitted, based on SharePrice not
// TradePrice, for all shares they ever bought in this market outcome.
interface TotalCost {
  totalCost: Tokens;
}

// TotalProfit is UnrealizedProfit plus RealizedProfit. Ie. TotalProfit is the
// profit a user made on previously owned shares in a market outcome, plus what
// they could make if they closed their current NetPosition in that outcome.
interface TotalProfit {
  totalProfit: Tokens;
}

// TotalProfitPercent is TotalProfit divided by TotalCost. Ie.
// TotalProfitPercent is the total/final percent profit a user
// would make if they closed their NetPosition at the LastPrice.
// In other words, TotalProfitPercent is what RealizedProfitPercent
// _would become_ if the user closed their NetPosition at LastPrice.
interface TotalProfitPercent {
  totalProfitPercent: Percent;
}

// TradePositionDelta is the increase or decrease to a user's
// NetPosition as the result of processing a trade. For example if a
// user's NetPosition=5 and TradePositionDelta=-2, then this trade is
// partially closing their long position with a trade quantity of 2.
interface TradePositionDelta {
  tradePositionDelta: Shares;
}

// TradeQuantityClosed is portion of a user's NetPosition which was
// closed as the result of processing a trade. For example if a user's
// NetPosition=5 and TradePositionDelta=2, then TradeQuantityClosed=0
// because the user is further opening, not closing their position in
// this trade. If a user's NetPosition=-10 and TradePositionDelta=7, then
// TradeQuantityClosed=7 ie. the user is closing 7 shares this trade.
interface TradeQuantityClosed {
  tradeQuantityClosed: Shares;
}

// TradeQuantityOpened is portion of a user's NetPosition which was
// opened as the result of processing a trade. For example if a user's
// NetPosition=5 and TradePositionDelta=2, then TradeQuantityOpened=2 because
// the user is further opening their position in this trade. If a user's
// NetPosition=-10 and TradePositionDelta=7, then TradeQuantityOpened=0 ie.
// the user is partially closing, not opening, their position in this trade.
interface TradeQuantityOpened {
  tradeQuantityOpened: Shares;
}

// TradeRealizedCostDelta is the change in RealizedCost as a result of processing
// a trade. Ie. NextRealizedCost = TradeRealizedCostDelta + RealizedCost.
interface TradeRealizedCostDelta {
  tradeRealizedCostDelta: Tokens;
}

// TradeRealizedRevenueDelta is the change in RealizedRevenue as a
// result of processing a trade. (At this time RealizedRevenue doesn't
// have its own type, it's built directly into NextRealizedProfit.)
interface TradeRealizedRevenueDelta {
  tradeRealizedRevenueDelta: Tokens;
}

// TradeRealizedProfitDelta is the change in RealizedProfit as a result of processing
// a trade. Ie. NextRealizedProfit = TradeRealizedProfitDelta + RealizedProfit.
interface TradeRealizedProfitDelta {
  tradeRealizedProfitDelta: Tokens;
}

// TradePrice is the price at which a trade executed. A trade is always
// on a single market outcome. TradePrice is the price shown in the UI,
// looking at the order book or historical price chart. NB TradePrice
// is not the cashflow price a user paid/received, that's SharePrice.
interface TradePrice {
  tradePrice: Price;
}

// TradePriceMinusMinPrice equal to TradePrice minus the MarketMinPrice.
// For technical/historical reasons we often pass around and store
// TradePriceMinusMinPrice instead of TradePrice. Eg. in the DB
// wcl_profit_loss_timeseries.price is a TradePriceMinusMinPrice.
interface TradePriceMinusMinPrice {
  tradePriceMinusMinPrice: Price;
}

// SharePrice is the cashflow price a user paid to get or received to
// give shares in a market outcome. SharePrice represents money exchanging
// hands, whereas TradePrice is the price at which the trade executed
// as shown in the UI order book. For example in a scalar market with
// MarketMinPrice=50, maxPrice=250, if a user opened a long position for
// one share at TradePrice=125, we have `TradePrice=125 - MarketMinPrice=50
// --> SharePrice=75`. NB in categorical markets the user may pay shares of
// other outcomes in lieu of tokens, which doesn't change the calculation for
// SharePrice, but it does mean that (in a categorical market) the user may
// pay shares of other outcomes instead of tokens when satisfying SharePrice.
interface SharePrice {
  sharePrice: Price;
}

// LastTradePriceMinusMinPrice is the TradePriceMinusMinPrice for the most recent
// trade (made by anyone) on that market outcome. LastTradePriceMinusMinPrice--
// also known as the "last price"-- is used to calculate UnrealizedRevenue.
interface LastTradePriceMinusMinPrice {
  lastTradePriceMinusMinPrice: Price;
}

// MarketMinPrice is a market's minimum TradePrice. In
// DB markets.minPrice. MarketMinPrice is necessary in
// general to convert between TradePrice and SharePrice.
interface MarketMinPrice {
  marketMinPrice: Price;
}

// MarketMaxPrice is a market's maximum TradePrice. In
// DB markets.maxPrice. MarketMaxPrice is necessary in
// general to convert between TradePrice and SharePrice.
interface MarketMaxPrice {
  marketMaxPrice: Price;
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
    // this trade closed the user's position
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: Price.ZERO };
  } else if (nextNetPosition.sign !== params.netPosition.sign) {
    // this trade reversed the user's position (from a short to long or vice versa)
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: params.tradePriceMinusMinPrice };
  }
  const { tradeQuantityOpened } = getTradeQuantityOpened(params);
  if (tradeQuantityOpened.isZero()) {
    return { nextAverageTradePriceMinusMinPriceForOpenPosition: params.averageTradePriceMinusMinPriceForOpenPosition };
  }
  // invariant: tradeQuantityOpened == tradePositionDelta, ie. position opened further.
  // this is a weighted average:
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

export function getUnrealizedRevenue(params: MarketMinPrice & MarketMaxPrice & NetPosition & LastTradePriceMinusMinPrice): UnrealizedRevenue {
  const { sharePrice } = getSharePriceForPosition({
    ...params,
    // user has an open position; we are computing potential revenue user would get
    // if they fully closed the position at LastPrice, that's why we use LastPrice.
    tradePriceMinusMinPrice: params.lastTradePriceMinusMinPrice,
  });
  return {
    unrealizedRevenue: sharePrice.multipliedBy(params.netPosition.abs()).expect(Tokens),
  };
}

export function getUnrealizedProfit(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastTradePriceMinusMinPrice): UnrealizedProfit {
  const { unrealizedRevenue } = getUnrealizedRevenue(params);
  const { unrealizedCost } = getUnrealizedCost(params);
  return {
    unrealizedProfit: unrealizedRevenue.minus(unrealizedCost),
  };
}

// We support passing UnrealizedCost/UnrealizedProfit because some clients
// have these but don't have other parameters like LastTradePriceMinusMinPrice.
export function getUnrealizedProfitPercent(params:
  (MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastTradePriceMinusMinPrice)
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

export function getTotalProfit(params: MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastTradePriceMinusMinPrice & RealizedProfit): TotalProfit {
  const { unrealizedProfit } = getUnrealizedProfit(params);
  return {
    totalProfit: unrealizedProfit.plus(params.realizedProfit),
  };
}

// We support passing TotalCost/TotalProfit because some clients have
// these but don't have other parameters like LastTradePriceMinusMinPrice.
export function getTotalProfitPercent(params:
  (MarketMinPrice & MarketMaxPrice & NetPosition & AverageTradePriceMinusMinPriceForOpenPosition & LastTradePriceMinusMinPrice & RealizedCost & RealizedProfit)
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

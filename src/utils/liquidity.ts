import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import * as _ from "lodash";
import { Address, MarketsRow, OrdersRow, OrderState } from "../types";
import { Percent, Price, Shares, Tokens } from "./dimension-quantity";
import { MarketMaxPrice, MarketMinPrice, TradePrice } from "./financial-math";

// DefaultSpreadPercentString is the default value for a new market or outcome.
export const DefaultSpreadPercentString: string = "1";
export const DefaultSpreadPercentBigNumber: BigNumber = new BigNumber(DefaultSpreadPercentString, 10);

// QuantityAtPrice is one line in the order book
interface QuantityAtPrice extends TradePrice {
  quantity: Shares;
}

interface GetOutcomeSpreadParams extends MarketMinPrice, MarketMaxPrice {
  bidsSortedByPriceDescending: Array<QuantityAtPrice>;
  asksSortedByPriceAscending: Array<QuantityAtPrice>;
  percentQuantityIncludedInSpread: Percent; // tuning parameter. Percent quantity of largest side order book side that will be used to calculate spread percent
}

const DefaultPercentQuantityIncludedInSpread = new Percent(new BigNumber(0.1)); // default for GetOutcomeSpreadParams.percentQuantityIncludedInSpread

interface GetOutcomeSpreadResult {
  spreadPercent: Percent;
}

// updateSpreadPercentForMarketAndOutcomes updates in DB markets.spreadPercent
// and outcomes.spreadPercent the passed market and all its outcomes.
// Clients must call updateSpreadPercentForMarketAndOutcomes
// each time the orders table changes for any reason.
export async function updateSpreadPercentForMarketAndOutcomes(db: Knex, marketId: Address): Promise<void> {
  const marketsQuery: undefined | Pick<MarketsRow<BigNumber>, "marketType" | "numOutcomes" | "minPrice" | "maxPrice"> = await db
    .first("marketType", "numOutcomes", "minPrice", "maxPrice")
    .from("markets")
    .where({ marketId });
  if (marketsQuery === undefined) throw new Error(`expected to find marketId=${marketId}`);

  type OrderPartial = Pick<OrdersRow<BigNumber>, "price" | "amount" | "outcome" | "orderType">;
  const orders: Array<OrderPartial> = await db
    .select("price", "amount", "outcome", "orderType")
    .from("orders")
    .where({
      orderState: OrderState.OPEN,
      marketId,
    });

  const outcomes: Array<number> = (() => {
    if (marketsQuery.marketType === "yesNo" || marketsQuery.marketType === "scalar") return [1]; // yesNo markets use only outcome number 1, the YES order book; scalar markets use only outcome number 1, the UPPER order book
    // Categorical markets use outcomes from [0, numOutcomes-1] (both inclusive):
    const tmpOutcomes = [];
    for (let i = 0; i < marketsQuery.numOutcomes; i++) tmpOutcomes.push(i);
    return tmpOutcomes;
  })();

  const outcomeSpreads: Array<GetOutcomeSpreadResult & { outcome: number }> = outcomes.map((outcome) => {
    const outcomeBids: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "buy"),
      (o: OrderPartial) => o.price.toNumber(),
    ).reverse().map(orderToQuantityAtPrice); // lodash.sortBy sorts ascending, but bids must be price descending
    const outcomeAsks: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "sell"),
      (o: OrderPartial) => o.price.toNumber(),
    ).map(orderToQuantityAtPrice);

    const outcomeSpread = getOutcomeSpread({
      bidsSortedByPriceDescending: outcomeBids,
      asksSortedByPriceAscending: outcomeAsks,
      marketMinPrice: new Price(marketsQuery.minPrice),
      marketMaxPrice: new Price(marketsQuery.maxPrice),
      percentQuantityIncludedInSpread: DefaultPercentQuantityIncludedInSpread,
    });
    return {
      outcome,
      ...outcomeSpread,
    };
  });

  const marketSpreadPercent: Percent = outcomeSpreads.reduce<Percent>(
    (maxOutcomeSpread, os) => maxOutcomeSpread.max(os.spreadPercent),
    Percent.ZERO);

  outcomeSpreads.forEach(async (os) => {
    await db("outcomes").update({
      spreadPercent: os.spreadPercent.magnitude.toString(),
    }).where({ outcome: os.outcome, marketId });
  });

  await db("markets").update({
    spreadPercent: marketSpreadPercent.magnitude.toString(),
  }).where({ marketId });

  function orderToQuantityAtPrice(o: OrderPartial): QuantityAtPrice {
    return {
      quantity: new Shares(o.amount),
      tradePrice: new Price(o.price),
    };
  }
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

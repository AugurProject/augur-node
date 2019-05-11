import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import * as _ from "lodash";
import { Address, MarketsRow, OrdersRow, OrderState } from "../types";
import { Percent, Price, Shares, Tokens } from "./dimension-quantity";
import { MarketMaxPrice, MarketMinPrice, TradePrice } from "./financial-math";

// updateSpreadPercentForMarketAndOutcomes updates in DB markets.spreadPercent
// and outcomes.spreadPercent the passed market and all its outcomes.
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

  // outcomeSpreads[i] is OutcomeSpread for outcome outcomes[i]
  const outcomeSpreads: Array<OutcomeSpread> = outcomes.map((outcome) => {
    const outcomeBids: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "buy"),
      (o: OrderPartial) => o.price.toNumber(),
    ).reverse().map(orderToQuantityAtPrice); // lodash.sortBy sorts ascending, but bids must be price descending
    const outcomeAsks: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "sell"),
      (o: OrderPartial) => o.price.toNumber(),
    ).map(orderToQuantityAtPrice);

    return getOutcomeSpread({
      bidsSortedByPriceDescending: outcomeBids,
      asksSortedByPriceAscending: outcomeAsks,
      marketMinPrice: new Price(marketsQuery.minPrice),
      marketMaxPrice: new Price(marketsQuery.maxPrice),
      ...DefaultTuningParams,
    });
  });

  const marketSpreadPercent: Percent = outcomeSpreads.reduce<Percent>(
    (maxOutcomeSpread, os) => maxOutcomeSpread.max(os.spreadPercent),
    Percent.ZERO);

  outcomes.forEach(async (outcome, index) => {
    await db("outcomes").update({
      spreadPercent: outcomeSpreads[index].spreadPercent.magnitude.toString(),
    }).where({ outcome, marketId });
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

interface QuantityAtPrice extends TradePrice {
  quantity: Shares;
}

interface GetOutcomeSpreadTuningParameters {
  percentQuantityIncludedInSpread: Percent;
}

const DefaultTuningParams: GetOutcomeSpreadTuningParameters = {
  percentQuantityIncludedInSpread: new Percent(new BigNumber(0.1)),
};

interface GetOutcomeSpreadParams extends
  GetOutcomeSpreadTuningParameters,
  MarketMinPrice,
  MarketMaxPrice {
  bidsSortedByPriceDescending: Array<QuantityAtPrice>;
  asksSortedByPriceAscending: Array<QuantityAtPrice>;
}

interface OutcomeSpread {
  spreadPercent: Percent;
}

function getOutcomeSpread(params: GetOutcomeSpreadParams): OutcomeSpread {
  const sumAskQuantity: Shares = params.asksSortedByPriceAscending.reduce<Shares>((sum, qtyAtPrice) => sum.plus(qtyAtPrice.quantity), Shares.ZERO);
  const sumBidQuantity: Shares =
    params.bidsSortedByPriceDescending.reduce<Shares>((sum, qtyAtPrice) => sum.plus(qtyAtPrice.quantity), Shares.ZERO);
  const xPercentShares = sumAskQuantity.max(sumBidQuantity)
    .multipliedBy(params.percentQuantityIncludedInSpread); // TODO rename xPercentShares to something ??
  const smallestSideAmount = sumAskQuantity.min(sumBidQuantity);
  let numShares = xPercentShares.min(smallestSideAmount);

  let bidValue = Tokens.ZERO;
  let askValue = Tokens.ZERO;

  // TODO refactor into helper method and use for both bidValue and askValue
  let qtyRemainingToTake = numShares;
  let i = 0;
  while (qtyRemainingToTake.gt(Shares.ZERO)) {
    const qtyToTakeAtThisPrice = qtyRemainingToTake.min(
      params.bidsSortedByPriceDescending[i].quantity);
    bidValue = bidValue.plus(
      qtyToTakeAtThisPrice.multipliedBy(
        params.bidsSortedByPriceDescending[i].tradePrice).expect(Tokens));
    qtyRemainingToTake = qtyRemainingToTake.minus(qtyToTakeAtThisPrice);
    i += 1;
  }

  qtyRemainingToTake = numShares;
  i = 0;
  while (qtyRemainingToTake.gt(Shares.ZERO)) {
    const qtyToTakeAtThisPrice = qtyRemainingToTake.min(
      params.asksSortedByPriceAscending[i].quantity);
    askValue = askValue.plus(
      qtyToTakeAtThisPrice.multipliedBy(
        params.asksSortedByPriceAscending[i].tradePrice).expect(Tokens));
    qtyRemainingToTake = qtyRemainingToTake.minus(qtyToTakeAtThisPrice);
    i += 1;
  }

  if (numShares.lte(Shares.ZERO)) {
    // one or both sides of order book was empty; we'll pretend instead
    // it/each had 1 share to faciliate calculating spreadPercent.
    numShares = numShares.plus(Shares.ONE);
    if (sumBidQuantity.lte(Shares.ZERO)) {
      // bid side of order book was empty
      bidValue = params.marketMinPrice.multipliedBy(Shares.ONE).expect(Tokens);
    }
    if (sumAskQuantity.lte(Shares.ZERO)) {
      // ask side of order book was empty
      askValue = params.marketMaxPrice.multipliedBy(Shares.ONE).expect(Tokens);
    }
  }

  const spreadPercent: Percent = (() => {
    const tmpSpreadPercent = askValue.minus(bidValue).dividedBy(
      params.marketMaxPrice.minus(params.marketMinPrice).multipliedBy(numShares))
      .expect(Percent);

    // TODO rm
    if (tmpSpreadPercent.lt(Percent.ZERO)) {
      console.log("tmpSpreadPercent less than zero", tmpSpreadPercent.magnitude.toNumber(), "askValue", askValue.magnitude.toNumber(), "bidValue", bidValue.magnitude.toNumber(), "marketId");
      // got 285 logs in blocks { fromBlock: 6065353, toBlock: 6066072 }
      // (node:91641) UnhandledPromiseRejectionWarning: Error: SQLITE_CONSTRAINT: CHECK constraint failed: nonnegativeSpreadPercent
      // (node:91641) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). (rejection id: 26)
    }

    return tmpSpreadPercent.lt(Percent.ZERO) ? Percent.ZERO : tmpSpreadPercent;
  })();

  return {
    spreadPercent,
  };
}

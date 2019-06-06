import * as Knex from "knex";
import * as _ from "lodash";
import { Address, MarketsRow, OrdersRow, OrderState } from "../types";
import { Percent, Price, Shares, Tokens } from "./dimension-quantity";
import { DisplayRange, getDisplayRange, getSharePrice, getTotalFeeRate, MarketCreatorFeeRate, MarketMaxPrice, MarketMinPrice, ReporterFeeRate, TotalFeeRate, TradePrice } from "./financial-math";

export interface QuantityAtPrice extends TradePrice {
  quantity: Shares;
}

export interface BidsAndAsks {
  bidsSortedByPriceDescending: Array<QuantityAtPrice>;
  asksSortedByPriceAscending: Array<QuantityAtPrice>;
}

interface MarketOrderBooks extends MarketMinPrice, MarketMaxPrice, ReporterFeeRate, MarketCreatorFeeRate, TotalFeeRate, DisplayRange {
  numOutcomes: number; // number of outcomes in this market
  endDate: Date; // market end Date
  orderBooks: Array<{ outcome: number, orderBook: OrderBook }>;
}

export async function getMarketOrderBooks(db: Knex, marketId: Address): Promise<MarketOrderBooks> {
  const marketsQuery: undefined | Pick<MarketsRow<BigNumber>, "marketType" | "numOutcomes" | "minPrice" | "maxPrice" | "marketCreatorFeeRate" | "reportingFeeRate" | "endTime"> = await db
    .first("marketType", "numOutcomes", "minPrice", "maxPrice", "marketCreatorFeeRate", "reportingFeeRate", "endTime")
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

  const marketMinPrice = new Price(marketsQuery.minPrice);
  const marketMaxPrice = new Price(marketsQuery.maxPrice);

  const reporterFeeRate = new Percent(marketsQuery.reportingFeeRate);
  const marketCreatorFeeRate = new Percent(marketsQuery.marketCreatorFeeRate);
  const { totalFeeRate } = getTotalFeeRate({ reporterFeeRate, marketCreatorFeeRate });

  const { displayRange } = getDisplayRange({
    marketMinPrice,
    marketMaxPrice,
  });

  const orderBooks = outcomes.map((outcome) => {
    const bidsSortedByPriceDescending: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "buy"),
      (o: OrderPartial) => o.price.toNumber(),
    ).reverse().map(orderToQuantityAtPrice); // lodash.sortBy sorts ascending, but bids must be price descending
    const asksSortedByPriceAscending: Array<QuantityAtPrice> = _.sortBy(
      orders.filter((o) => o.outcome === outcome && o.orderType === "sell"),
      (o: OrderPartial) => o.price.toNumber(),
    ).map(orderToQuantityAtPrice);

    return {
      outcome,
      orderBook: makeOrderBook({
        marketMinPrice,
        marketMaxPrice,
        bidsSortedByPriceDescending,
        asksSortedByPriceAscending,
      }),
    };
  });

  const marketOrderBooks: MarketOrderBooks = {
    marketMinPrice,
    marketMaxPrice,
    reporterFeeRate,
    marketCreatorFeeRate,
    totalFeeRate,
    displayRange,
    numOutcomes: marketsQuery.numOutcomes,
    endDate: new Date(marketsQuery.endTime * 1000),
    orderBooks,
  };

  return marketOrderBooks;

  function orderToQuantityAtPrice(o: OrderPartial): QuantityAtPrice {
    return {
      quantity: new Shares(o.amount),
      tradePrice: new Price(o.price),
    };
  }
}

interface OrderBookOptions {
  dryRun: boolean; // iff dryRun true then simulated trades won't modify the order book
}

// OrderBook is a simulated order book to simulate trades.
export interface OrderBook {
  // cloneDeep(): OrderBook;

  // getBidsAndAsks returns a copy of the internal BidsAndAsks which the caller may then mutate.
  getBidsAndAsks(): BidsAndAsks;

  // reset(): void // reset Order book to its initial state, discarding any mutative operations

  // closeLongFillOnly simulates partially or fully closing a long
  // position in the amount of the passed shares by only taking existing
  // orders. Ie. closeLongFillOnly takes orders from the buy side of
  // the order book. Returns the token proceeds from selling the shares.
  closeLongFillOnly(quantityToSell: Shares, opts?: OrderBookOptions): Tokens;

  // closeLongFillOnlyWithFeeAdjustment does a closeLongFillOnly and then adjusts the
  // proceeds by the passed feeRate which normalizes fees to compare across markets.
  closeLongFillOnlyWithFeeAdjustment(quantityToSell: Shares, feeRate: Percent, opts?: OrderBookOptions): Tokens;

  // closeShortFillOnly simulates partially or fully closing a short
  // position in the amount of the passed shares by only taking existing
  // orders. Ie. closeShortFillOnly takes orders from the sell side of
  // the order book. Returns the token proceeds from selling the shares.
  closeShortFillOnly(quantityToSell: Shares, opts?: OrderBookOptions): Tokens;

  // closeShortFillOnlyWithFeeAdjustment does a closeShortFillOnly
  // and then adjusts the proceeds by the passed feeRate
  // which normalizes fees to compare across markets.
  closeShortFillOnlyWithFeeAdjustment(quantityToSell: Shares, feeRate: Percent, opts?: OrderBookOptions): Tokens;
}

// takeBest is a helper function for the OrderBook implementation in
// makeOrderBook. takeBest may mutate the passed bidsOrAsks as well
// the caller must set its bid or asks to the returned bidsOrAsks.
function takeBest(
  marketMinPrice: MarketMinPrice,
  marketMaxPrice: MarketMaxPrice,
  bidsOrAsks: Array<QuantityAtPrice>,
  amountToTake: Shares,
  takeType: "long" | "short",
  opts: OrderBookOptions): {
    newBidsOrAsks: Array<QuantityAtPrice>,
    proceeds: Tokens,
  } {
  let newBidsOrAsks = bidsOrAsks;
  let proceeds = Tokens.ZERO;
  let sharesRemaining = amountToTake;

  while (sharesRemaining.gt(Shares.ZERO)) {
    if (newBidsOrAsks.length < 1) break;

    const { sharePrice } = getSharePrice({
      ...marketMinPrice,
      ...marketMaxPrice,
      tradePrice: newBidsOrAsks[0].tradePrice,
      positionType: takeType,
    });

    if (newBidsOrAsks[0].quantity.gt(sharesRemaining)) {
      proceeds = proceeds.plus(sharesRemaining.multipliedBy(sharePrice));
      if (!opts.dryRun) {
        newBidsOrAsks[0].quantity = newBidsOrAsks[0].quantity.minus(sharesRemaining);
      }
      break;
    }

    proceeds = proceeds.plus(newBidsOrAsks[0].quantity.multipliedBy(sharePrice));
    sharesRemaining = sharesRemaining.minus(newBidsOrAsks[0].quantity);
    if (!opts.dryRun) {
      newBidsOrAsks[0].quantity = Shares.ZERO;
    }
    newBidsOrAsks = newBidsOrAsks.slice(1); // can optimize to avoid copying entire array; could use pop() or an index (i) for this loop and then slice once at end of this function
  }
  return {
    newBidsOrAsks,
    proceeds,
  };
}

// makeOrderBook postcondition: passed BidsAndAsks are now owned
// by the returned OrderBook and must not be mutated by the caller.
function makeOrderBook(params: MarketMinPrice & MarketMaxPrice & BidsAndAsks): OrderBook {
  let bids: Array<QuantityAtPrice> = params.bidsSortedByPriceDescending;
  let asks: Array<QuantityAtPrice> = params.asksSortedByPriceAscending;

  const defaultOpts: OrderBookOptions = {
    dryRun: false,
  };

  // getBidsAndAsks is currently unsafe because the caller must remember not to modify the returned bids/asks; instead we should deep clone
  function getBidsAndAsks(): BidsAndAsks {
    return {
      bidsSortedByPriceDescending: bids,
      asksSortedByPriceAscending: asks,
    };
  }

  function closeLongFillOnly(quantityToSell: Shares, opts: OrderBookOptions = defaultOpts): Tokens {
    const r = takeBest(
      params, // ie. MarketMinPrice
      params, // ie. MarketMaxPrice
      bids,
      quantityToSell,
      "long",
      opts,
    );
    if (!opts.dryRun) {
      bids = r.newBidsOrAsks;
    }

    return r.proceeds;
  }

  function closeLongFillOnlyWithFeeAdjustment(quantityToSell: Shares, feeRate: Percent, opts: OrderBookOptions = defaultOpts): Tokens {
    return closeLongFillOnly(quantityToSell, opts)
      .dividedBy(Percent.ONE.minus(feeRate));
  }

  function closeShortFillOnly(quantityToSell: Shares, opts: OrderBookOptions = defaultOpts): Tokens {
    const r = takeBest(
      params, // ie. MarketMinPrice
      params, // ie. MarketMaxPrice
      asks,
      quantityToSell,
      "short",
      opts,
    );
    if (!opts.dryRun) {
      asks = r.newBidsOrAsks;
    }
    return r.proceeds;
  }

  function closeShortFillOnlyWithFeeAdjustment(quantityToSell: Shares, feeRate: Percent, opts: OrderBookOptions = defaultOpts): Tokens {
    return closeShortFillOnly(quantityToSell, opts)
      .dividedBy(Percent.ONE.plus(feeRate));
  }

  return {
    getBidsAndAsks,
    closeLongFillOnly,
    closeLongFillOnlyWithFeeAdjustment,
    closeShortFillOnly,
    closeShortFillOnlyWithFeeAdjustment,
  };
}

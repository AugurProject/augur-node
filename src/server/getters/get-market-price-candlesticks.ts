import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { BigNumber } from "bignumber.js";
import { ZERO } from "../../constants";
import { OutcomeParam } from "../../types";
import { volumeForTrade } from "../../blockchain/log-processors/order-filled/update-volumetrics";

export const MarketPriceCandlesticksParams = t.type({
  marketId: t.string,
  outcome: t.union([OutcomeParam, t.number, t.null, t.undefined]),
  start: t.union([t.number, t.null, t.undefined]),
  end: t.union([t.number, t.null, t.undefined]),
  period: t.union([t.number, t.null, t.undefined]),
});

interface MarketPriceHistoryRow {
  timestamp: number;
  outcome: number;
  price: BigNumber;
  amount: BigNumber;
  numCreatorTokens: BigNumber;
  numCreatorShares: BigNumber;
  numFillerTokens: BigNumber;
  numFillerShares: BigNumber;
}

export interface Candlestick {
  startTimestamp: number;
  start: string;
  end: string;
  min: string;
  max: string;
  volume: string; // volume in ETH for this Candlestick's time window, has same business definition as markets/outcomes.volume
  shareVolume: string; // shareVolume in number of shares for this Candlestick's time window, has same business definition as markets/outcomes.shareVolume
  tokenVolume: string; // TEMPORARY - this is a copy of Candlestick.shareVolume for the purposes of a backwards-compatible renaming of tokenVolume->shareVolume. The UI should change all references of Candlestick.tokenVolume to shareVolume and then this field can be removed.
}

export interface UICandlesticks {
  [outcome: number]: Array<Candlestick>;
}

function getPeriodStarttime(globalStarttime: number, periodStartime: number, period: number) {
  const secondsSinceGlobalStart = (periodStartime - globalStarttime);
  return (secondsSinceGlobalStart - secondsSinceGlobalStart % period) + globalStarttime;
}

export async function getMarketPriceCandlesticks(db: Knex, augur: {}, params: t.TypeOf<typeof MarketPriceCandlesticksParams>): Promise<UICandlesticks> {
  const marketsRowPromise = db("markets").first("minPrice", "maxPrice").where({ marketId: params.marketId });
  const query = db.select([
    "trades.outcome",
    "trades.price",
    "trades.amount",
    "trades.numCreatorShares",
    "trades.numCreatorTokens",
    "trades.numFillerTokens",
    "trades.numFillerShares",
    "blocks.timestamp",
  ]).from("trades").join("blocks", "trades.blockNumber", "blocks.blockNumber").where("marketId", params.marketId);
  if (params.start != null) query.where("blocks.timestamp", ">=", params.start);
  if (params.end != null) query.where("blocks.timestamp", "<=", params.end);
  if (params.outcome) query.where("outcome", params.outcome);
  const marketsRow: { minPrice: BigNumber, maxPrice: BigNumber } | undefined = await marketsRowPromise;
  if (marketsRow === undefined) throw new Error(`No marketId for getMarketPriceCandlesticks: ${params.marketId}`);
  const tradesRows: Array<MarketPriceHistoryRow> = await query;
  const tradeRowsByOutcome = _.groupBy(tradesRows, "outcome");
  return _.mapValues(tradeRowsByOutcome, (outcomeTradeRows) => {
    const outcomeTradeRowsByPeriod = _.groupBy(outcomeTradeRows, (tradeRow) => getPeriodStarttime(params.start || 0, tradeRow.timestamp, params.period || 60));
    return _.map(outcomeTradeRowsByPeriod, (trades: Array<MarketPriceHistoryRow>, startTimestamp): Candlestick => {
      // TODO remove this partialCandlestick stuff and just return
      // a Candlestick after the temporary Candlestick.tokenVolume
      // is removed (see note on Candlestick.tokenVolume).
      const partialCandlestick: Pick<Candlestick, Exclude<keyof Candlestick, "tokenVolume">> = { // this Pick/Exclude stuff just allows us to set the Candlestick.tokenVolume later, but in a typesafe way that prevents typos.
        startTimestamp: parseInt(startTimestamp, 10),
        start: _.minBy(trades, "timestamp")!.price.toString(),
        end: _.maxBy(trades, "timestamp")!.price.toString(),
        min: _.minBy(trades, "price")!.price.toString(),
        max: _.maxBy(trades, "price")!.price.toString(),
        volume: _.reduce(trades, (totalVolume: BigNumber, tradeRow: MarketPriceHistoryRow) => totalVolume.plus(volumeForTrade({
          marketMinPrice: marketsRow.minPrice,
          marketMaxPrice: marketsRow.maxPrice,
          numCreatorTokens: tradeRow.numCreatorTokens,
          numCreatorShares: tradeRow.numCreatorShares,
          numFillerTokens: tradeRow.numFillerTokens,
          numFillerShares: tradeRow.numFillerShares,
        })), ZERO).toString(),
        shareVolume: _.reduce(trades, (totalShareVolume: BigNumber, tradeRow: MarketPriceHistoryRow) => totalShareVolume.plus(tradeRow.amount), ZERO).toString(), // the business definition of shareVolume should be the same as used with markets/outcomes.shareVolume (which currently is just summation of trades.amount)
      };
      return {
        tokenVolume: partialCandlestick.shareVolume, // tokenVolume is temporary, see note on Candlestick.tokenVolume
        ...partialCandlestick,
      };
    });
  });
}

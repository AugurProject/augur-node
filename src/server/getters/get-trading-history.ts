import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import { TradingHistoryRow, UITrade, SortLimitParams, OutcomeParam } from "../../types";
import { queryTradingHistoryParams } from "./database";

export const TradingHistoryParamsSpecific = t.type({
  universe: t.union([t.string, t.null, t.undefined]),
  account: t.union([t.string, t.null, t.undefined]),
  marketId: t.union([t.string, t.null, t.undefined,
    t.array(t.string)]), // eg. marketId: ["0x123", "0x456"] will restrict trading history to only those two markets; filtering by list of marketIds was added later and we did it this way to maintain backwards compatibility
  outcome: t.union([OutcomeParam, t.number, t.null, t.undefined]),
  orderType: t.union([t.string, t.null, t.undefined]),
  ignoreSelfTrades: t.union([t.boolean, t.null, t.undefined]),
  earliestCreationTime: t.union([t.number, t.null, t.undefined]),
  latestCreationTime: t.union([t.number, t.null, t.undefined]),
});

export const TradingHistoryParams = t.intersection([
  TradingHistoryParamsSpecific,
  SortLimitParams,
]);

// Look up a user or market trading history. Must provide universe OR market. Outcome and orderType are optional parameters.
export async function getTradingHistory(db: Knex, augur: Augur, params: t.TypeOf<typeof TradingHistoryParams>): Promise<Array<UITrade>> {
  const userTradingHistory: Array<TradingHistoryRow> = await queryTradingHistoryParams(db, params);
  return userTradingHistory.map((trade: TradingHistoryRow): UITrade => {
    const isMaker: boolean | null = params.account == null ? null : params.account === trade.creator; // ie. true if and only if this invocation of getTradingHistory is from perspective of creator/maker of this trade's order.
    return Object.assign(_.pick(trade, [
      "transactionHash",
      "logIndex",
      "orderId",
      "filler",
      "creator",
      "marketId",
      "outcome",
      "shareToken",
      "timestamp",
      "tradeGroupId",
    ]), {
      type: isMaker ? trade.orderType : (trade.orderType === "buy" ? "sell" : "buy"), // in the db, trades.orderType is from perspective of order creator/maker, so if we just use value of trades.orderType then the UITrade.type will always be from perspective of order creator/maker. As a UX concern, we want to default to the perspective of filler/taker, so we flip buy/sell unless isMaker.
      price: trade.price.toString(),
      amount: trade.amount.toString(),
      maker: isMaker,
      selfFilled: trade.creator === trade.filler,
      marketCreatorFees: trade.marketCreatorFees.toString(),
      reporterFees: trade.reporterFees.toString(),
      settlementFees: new BigNumber(trade.reporterFees, 10).plus(new BigNumber(trade.marketCreatorFees, 10)).toString(),
    });
  });
}

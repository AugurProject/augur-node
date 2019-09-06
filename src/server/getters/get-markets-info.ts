import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { BigNumber } from "bignumber.js";
import { Address, OutcomesRow, UIMarketInfo, UIMarketsInfo, UIOutcomeInfo, PayoutRow, MarketsContractAddressRow, TotalInitialREPStakeRow } from "../../types";
import { reshapeOutcomesRowToUIOutcomeInfo, reshapeMarketsRowToUIMarketInfo, getMarketsWithReportingState, batchAndCombine } from "./database";

export const MarketsInfoParams = t.type({
  marketIds: t.array(t.union([t.string, t.null, t.undefined])),
});

export async function getMarketsInfo(db: Knex, augur: {}, params: t.TypeOf<typeof MarketsInfoParams>): Promise<UIMarketsInfo<string>> {
  if (params.marketIds == null || ! _.isArray(params.marketIds) ) throw new Error("must include marketIds parameter");
  const marketInfoComplete: Array<UIMarketInfo<string>> = await batchAndCombine(params.marketIds, _.partial(getUIMarketsInfo, db));
  const marketsInfoByMarket = _.keyBy(marketInfoComplete, (r): string => r.id);
  return _.map(params.marketIds, (marketId: string): UIMarketInfo<string>|null => {
    return marketsInfoByMarket[marketId] || null;
  });
}

export async function getUIMarketsInfo(db: Knex, marketIds: Array<Address>): Promise<Array<UIMarketInfo<string>>> {
  const marketsQuery: Knex.QueryBuilder = getMarketsWithReportingState(db);
  const cleanedMarketIds = _.compact(marketIds);
  marketsQuery.whereIn("markets.marketId", cleanedMarketIds);
  marketsQuery.leftJoin("blocks as finalizationBlockNumber", "finalizationBlockNumber.blockNumber", "markets.finalizationBlockNumber").select("finalizationBlockNumber.timestamp as finalizationTime");
  marketsQuery.leftJoin("blocks as lastTradeBlock", "lastTradeBlock.blockNumber", "markets.lastTradeBlockNumber").select("lastTradeBlock.timestamp as lastTradeTime");
  const marketsRows = await marketsQuery;
  const outcomesRows = await db("outcomes").whereIn("marketId", cleanedMarketIds);
  const winningPayoutRows = await db("payouts").whereIn("marketId", cleanedMarketIds).where("winning", 1);
  if (!marketsRows) return [];
  const outcomesRowsByMarket = _.groupBy(outcomesRows, (r: OutcomesRow<BigNumber>): string => r.marketId);
  const totalInitialREPStakeRows: Array<TotalInitialREPStakeRow<BigNumber>> = await db.raw(db.raw(`select balance as totalInitialREPStake, markets.marketId from balances join markets on (markets.marketId = balances.owner or markets.initialReporterAddress = balances.owner) join universes on universes.universe = markets.universe where balances.token = universes.reputationToken and markets.marketId in (?)`, [cleanedMarketIds]).toString());
  const totalInitialREPStakeByMarket = _.reduce(totalInitialREPStakeRows, (result, row) => {
    if (result[row.marketId]) {
      result[row.marketId] = result[row.marketId].plus(row.totalInitialREPStake);
    } else {
      result[row.marketId] = new BigNumber(row.totalInitialREPStake);
    }
    return result;
  }, {} as {[marketId: string]: BigNumber});
  const winningPayoutByMarket = _.keyBy(winningPayoutRows, (r: PayoutRow<BigNumber> & MarketsContractAddressRow): string => r.marketId);
  return _.map(marketsRows, (market): UIMarketInfo<string> => {
    const outcomes = _.map(outcomesRowsByMarket[market.marketId], (outcomesRow: OutcomesRow<BigNumber>): UIOutcomeInfo<BigNumber> => reshapeOutcomesRowToUIOutcomeInfo(outcomesRow));
    let totalInitialREPStake = new BigNumber(0);
    if (totalInitialREPStakeByMarket[market.marketId]) totalInitialREPStake = totalInitialREPStakeByMarket[market.marketId];
    return reshapeMarketsRowToUIMarketInfo(market, outcomes, winningPayoutByMarket[market.marketId], totalInitialREPStake);
  });
}

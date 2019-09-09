import * as t from "io-ts";
import * as Knex from "knex";
import { Address, MarketsContractAddressRow, SortLimitParams, TotalInitialREPStakeRow } from "../../types";
import { getMarketsWithReportingState, queryModifier } from "./database";
import { createSearchProvider } from "../../database/fts";
import { BigNumber } from "bignumber.js";
import { V2_CUTOFF_TIMESTAMP, WEEK_IN_SECONDS, STAKE_SCHEDULE } from "../../constants";
import * as _ from "lodash";
import { getCurrentTime } from "../../blockchain/process-block";

export const GetMarketsParamsSpecific = t.type({
  universe: t.string,
  creator: t.union([t.string, t.null, t.undefined]),
  category: t.union([t.string, t.null, t.undefined]),
  search: t.union([t.string, t.null, t.undefined]),
  reportingState: t.union([t.string, t.null, t.undefined, t.array(t.string)]), // filter markets by ReportingState. If non-empty, expected to be a ReportingState or ReportingState[]
  feeWindow: t.union([t.string, t.null, t.undefined]),
  designatedReporter: t.union([t.string, t.null, t.undefined]),
  maxFee: t.union([t.number, t.null, t.undefined]),
  maxEndTime: t.union([t.number, t.null, t.undefined]), // unix epoch time in seconds
  liquiditySortSpreadPercent: t.union([t.number, t.null, t.undefined]), // must be included and used if and only if sortBy === 'liquidityTokens'; each market has liquidityTokens defined for multiple spreadPercents, liquiditySortSpreadPercent determines which of these is included in markets result set
  enableInvalidFilter: t.union([t.boolean, t.null, t.undefined]), // if true then markets detected to be potentially invalid will be filtered out
  hasOrders: t.union([t.boolean, t.null, t.undefined]),
  enableInitialRepFilter: t.union([t.boolean, t.null, t.undefined]), // enable filter for minimum amount of initial REP stake based on v2
});

export const GetMarketsParams = t.intersection([
  GetMarketsParamsSpecific,
  SortLimitParams,
]);

// Returning marketIds should likely be more generalized, since it is a single line change for most getters (awaiting reporting, by user, etc)
export async function getMarkets(db: Knex, augur: {}, params: t.TypeOf<typeof GetMarketsParams>): Promise<Array<Address>> {
  const columns = ["markets.marketId", "marketStateBlock.timestamp as reportingStateUpdatedOn"];
  const query = getMarketsWithReportingState(db, columns);
  query.join("blocks as marketStateBlock", "marketStateBlock.blockNumber", "market_state.blockNumber");
  query.leftJoin("blocks as lastTradeBlock", "lastTradeBlock.blockNumber", "markets.lastTradeBlockNumber").select("lastTradeBlock.timestamp as lastTradeTime");

  if (params.sortBy === "liquidityTokens") {
    // liquidityTokens is not regularly a column in result set, so we'll
    // generate it to sort by liquidityTokens. Each market has liquidityTokens
    // defined for multiple spreadPercents, liquiditySortSpreadPercent
    // determines which of these is included in markets result set.
    const spreadPercent: number = params.liquiditySortSpreadPercent ? params.liquiditySortSpreadPercent : 1;
    query.innerJoin("markets_liquidity", function() {
      this.on("markets.marketId", "markets_liquidity.marketId")
        .andOn("markets_liquidity.spreadPercent", db.raw("?", spreadPercent));
    }).select("liquidityTokens")
    .whereRaw("cast(liquidityTokens as real) > 0"); // markets with liquidityTokens == 0 have no liquidity at this spreadPercent, we want to filter these out because sorting by liquidityTokens is both a sort and a filter by design
  }

  if (params.universe != null) query.where("universe", params.universe);
  if (params.creator != null) query.where({ marketCreator: params.creator });
  if (params.category != null) query.whereRaw("LOWER(markets.category) = ?", [params.category.toLowerCase()]);
  if (typeof params.reportingState === "string") {
    query.where("reportingState", params.reportingState);
  } else if (params.reportingState instanceof Array) {
    query.whereIn("reportingState", params.reportingState);
  }
  if (params.feeWindow != null) query.where("feeWindow", params.feeWindow);
  if (params.designatedReporter != null) query.where("designatedReporter", params.designatedReporter);
  if (params.hasOrders != null && params.hasOrders) {
    const ordersQuery = db("orders").select("orders.marketId").where("orderstate", "OPEN");
    query.whereIn("markets.marketId", ordersQuery);
  }

  const searchProvider = createSearchProvider(db);
  if (params.search != null && searchProvider !== null) {
    query.whereIn("markets.marketId", function (this: Knex.QueryBuilder) {
      searchProvider.searchBuilder(this, params.search!);
    });
  }

  if (params.maxFee) {
    query.whereRaw("(CAST(markets.reportingFeeRate as numeric) + CAST(markets.marketCreatorFeeRate as numeric)) < ?", [params.maxFee]);
  }

  if (params.enableInvalidFilter) {
    query.whereRaw("(CAST(markets.bestBidTakerInvalidProfitTokens as REAL) > 0 OR CAST(markets.bestAskTakerInvalidProfitTokens as REAL) > 0)");
  }

  if (params.maxEndTime) {
    query.whereRaw("markets.endTime < ?", [params.maxEndTime]);
  }

  let marketsRows = await queryModifier<MarketsContractAddressRow>(db, query, "volume", "desc", params);

  if (params.enableInitialRepFilter) {
    const marketIds = _.map(marketsRows, "marketId");
    const totalInitialREPStakeRows: Array<TotalInitialREPStakeRow<BigNumber>> = await db.raw(db.raw(`select balance as totalInitialREPStake, markets.marketId, markets.endTime from balances join markets on (markets.marketId = balances.owner or markets.initialReporterAddress = balances.owner) join universes on universes.universe = markets.universe where balances.token = universes.reputationToken and markets.marketId in (?)`, [marketIds]).toString());
    const totalInitialREPStakeByMarket = _.reduce(totalInitialREPStakeRows, (result, row) => {
      if (result[row.marketId]) {
        result[row.marketId].totalInitialREPStake = result[row.marketId].totalInitialREPStake.plus(row.totalInitialREPStake);
      } else {
        result[row.marketId] = {
          totalInitialREPStake:  new BigNumber(row.totalInitialREPStake),
          endTime: row.endTime,
        };
      }
      return result;
    }, {} as {[marketId: string]: { totalInitialREPStake: BigNumber, endTime: number }});
    marketsRows = _.filter(marketsRows, (row) => {
      const currentTime = getCurrentTime();
      const weeksTillV2 = Math.round((V2_CUTOFF_TIMESTAMP - currentTime) / WEEK_IN_SECONDS);
      let minIntialRep = new BigNumber(0);
      if (weeksTillV2 <= (STAKE_SCHEDULE.length - 1)) {
        minIntialRep = STAKE_SCHEDULE[weeksTillV2];
      }
      return totalInitialREPStakeByMarket[row.marketId] && totalInitialREPStakeByMarket[row.marketId].totalInitialREPStake.gte(minIntialRep);
    });
  }

  return marketsRows.map((marketsRow: MarketsContractAddressRow): Address => marketsRow.marketId);
}

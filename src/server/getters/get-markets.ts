import * as t from "io-ts";
import * as Knex from "knex";
import { Address, MarketsContractAddressRow, SortLimitParams } from "../../types";
import { getMarketsWithReportingState, queryModifier } from "./database";
import { createSearchProvider } from "../../database/fts";

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
});

export const GetMarketsParams = t.intersection([
  GetMarketsParamsSpecific,
  SortLimitParams,
]);

// Returning marketIds should likely be more generalized, since it is a single line change for most getters (awaiting reporting, by user, etc)
export async function getMarkets(db: Knex, augur: {}, params: t.TypeOf<typeof GetMarketsParams>) {
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
    query.whereRaw("CAST(markets.invalidROIPercent as REAL) <= 0 AND (CAST(markets.bestBidTakerInvalidProfitTokens as REAL) > 0 OR CAST(markets.bestAskTakerInvalidProfitTokens as REAL) > 0)");
  }

  if (params.maxEndTime) {
    query.whereRaw("markets.endTime < ?", [params.maxEndTime]);
  }

  const marketsRows = await queryModifier<MarketsContractAddressRow>(db, query, "volume", "desc", params);

  return marketsRows.map((marketsRow: MarketsContractAddressRow): Address => marketsRow.marketId);
}

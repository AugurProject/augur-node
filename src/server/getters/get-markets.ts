import * as Knex from "knex";
import { Address, MarketsContractAddressRow } from "../../types";
import { queryModifier, getMarketsWithReportingState } from "./database";

// Returning marketIds should likely be more generalized, since it is a single line change for most getters (awaiting reporting, by user, etc)
export function getMarkets(db: Knex, universe: Address, creator: Address|null|undefined, category: string|null|undefined, search: string|null|undefined, reportingState: string|null|undefined, feeWindow: Address|null|undefined, designatedReporter: Address|null|undefined, sortBy: string|null|undefined, isSortDescending: boolean|null|undefined, limit: number|null|undefined, offset: number|null|undefined, callback: (err?: Error|null, result?: any) => void): void {
  if (universe == null) return callback(new Error("Must provide universe"));
  const query = getMarketsWithReportingState(db, ["markets.marketId", "marketStateBlock.timestamp as reportingStateUpdatedOn"]);
  query.join("blocks as marketStateBlock", "marketStateBlock.blockNumber", "market_state.blockNumber");
  query.leftJoin("blocks as lastTradeBlock", "lastTradeBlock.blockNumber", "markets.lastTradeBlockNumber").select("lastTradeBlock.timestamp as lastTradeTime");

  if (universe != null) query.where({ universe });
  if (creator != null) query.where({ marketCreator: creator });
  if (category != null) query.whereRaw("LOWER(category) = ?", [category.toLowerCase()]);
  if (reportingState != null) query.where({ reportingState });
  if (feeWindow != null) query.where({ feeWindow });
  if (designatedReporter != null) query.where({ designatedReporter });
  if (search != null) query.innerJoin("search_en", "markets.marketId", "search_en.marketId")
    .whereRaw("search_en MATCH ?", [search]);

  queryModifier(db, query, "volume", "desc", sortBy, isSortDescending, limit, offset, (err?: Error|null, marketsRows?: Array<MarketsContractAddressRow>): void => {
    if (err) return callback(err);
    if (!marketsRows) return callback(null);
    callback(null, marketsRows.map((marketsRow: MarketsContractAddressRow): Address => marketsRow.marketId));
  });
}

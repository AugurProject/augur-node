import * as Knex from "knex";
import * as _ from "lodash";
import { Address, TimestampedPrice, MarketPriceHistory } from "../../types";
import { sortDirection } from "../../utils/sort-direction";

interface MarketPriceHistoryTradesRow extends TimestampedPrice {
  outcome: number;
}

// Input: MarketID
// Output: { outcome: [{ price, timestamp }] }
export function getMarketPriceHistory(db: Knex, marketID: Address|null|undefined, sortBy: string|null|undefined, isSortDescending: boolean|null|undefined, limit: number|null|undefined, offset: number|null|undefined, callback: (err?: Error|null, result?: MarketPriceHistory) => void): void {
  const columnsToSelect: Array<string> = ["outcome", "price", "tradeTime as timestamp"];
  let query: Knex.QueryBuilder = db.select(columnsToSelect).from("trades").where({ marketID }).orderBy(sortBy || "tradeTime", sortDirection(isSortDescending, "desc"));
  if (limit != null) query = query.limit(limit);
  if (offset != null) query = query.offset(offset);
  query.asCallback((err?: Error|null, tradesRows?: Array<MarketPriceHistoryTradesRow>): void => {
    if (err) return callback(err);
    if (!tradesRows || !tradesRows.length) return callback(null);

    // Group by outcome
    const marketPriceHistory: MarketPriceHistory = _.groupBy(tradesRows, (row: MarketPriceHistoryTradesRow): number => row.outcome)

    callback(null, marketPriceHistory);
  });
}

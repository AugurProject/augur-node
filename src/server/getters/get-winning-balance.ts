import * as Knex from "knex";
import * as _ from "lodash";
import { Address, UIMarketCreatorFee, ReportingState} from "../../types";
import { getMarketsWithReportingState } from "./database";
import Augur from "augur.js";
import { ZERO } from "../../constants";

interface MarketCreatorFeesRow {
  marketId: Address;
  reportingState: ReportingState;
  marketCreatorFeesBalance: BigNumber;
  balance: BigNumber;
}

export function getWinningBalance(db: Knex, augur: Augur, marketIds: Array<Address>, account: Address, callback: (err: Error|null, result?: any) => void): void {
  if (marketIds == null) return callback(new Error("must include marketIds parameter"));
  if (account == null) return callback(new Error("must include account parameter"));
  const marketsQuery: Knex.QueryBuilder = getMarketsWithReportingState(db, ["markets.marketId", "markets.numTicks", "balances.balance", "balances.owner"]);
  // marketsQuery.whereIn("markets.marketId", marketIds);
  // marketsQuery.whereIn("reportingState", [ReportingState.FINALIZED, ReportingState.AWAITING_FINALIZATION])
  marketsQuery.join("tokens AS shareTokens", function () {
    this
      .on("shareTokens.marketId", "markets.marketId")
      .andOn("symbol", db.raw("?", "shares"));
  });
  marketsQuery.join("balances", function () {
    this
      .on("balances.token", "shareTokens.contractAddress")
      // .andOn("balances.owner", db.raw("?", account));
  });
  marketsQuery.join("payouts", function () {
    this
      .on("payouts.marketId", "markets.marketId")
      // .andOn("payouts.winning", db.raw("1"));
    // .andOn("balances.owner", db.raw("?", account));
  });
  marketsQuery.asCallback(( err: Error|null, marketCreatorFeeRows: Array<MarketCreatorFeesRow>): void => {
    if (err != null) return callback(err);
    callback(null, marketCreatorFeeRows);
  });
}

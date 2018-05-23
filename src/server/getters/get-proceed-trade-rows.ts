import * as Knex from "knex";
import * as _ from "lodash";
import { BigNumber } from "bignumber.js";
import { Address, ReportingState, PayoutRow, ProceedTradesRow } from "../../types";
import { getMarketsWithReportingState, groupByAndSum } from "./database";
import { fixedPointToDecimal, numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";
import { BN_WEI_PER_ETHER } from "../../constants";
import Augur from "augur.js";

interface WinningPayoutRow extends PayoutRow<BigNumber> {
  timestamp: number;
  marketId: Address;
  numTicks: BigNumber;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  reportingState: ReportingState;
  balance: BigNumber;
  outcome: number;
}

export async function getProceedTradeRows (db: Knex, augur: Augur, marketIds: Array<Address>, account: Address): Promise<Array<ProceedTradesRow<BigNumber>>> {
  if (marketIds == null) throw new Error("must include marketIds parameter");
  if (account == null) throw new Error("must include account parameter");

  const marketsQuery: Knex.QueryBuilder = getMarketsWithReportingState(db, [
    "proceeds_block.timestamp",
    "markets.marketId",
    "markets.numTicks",
    "markets.minPrice",
    "markets.maxPrice",
    "trading_proceeds.numShares as balance",
    "balances.owner",
    "shareTokens.outcome",
    "payouts.*",
  ]);
  marketsQuery.whereIn("markets.marketId", marketIds);
  marketsQuery.whereIn("reportingState", [ReportingState.FINALIZED, ReportingState.AWAITING_FINALIZATION]);
  marketsQuery.join("trading_proceeds", function() {
    this
      .on("trading_proceeds.shareToken", "shareTokens.contractAddress");
  });
  marketsQuery.join("tokens AS shareTokens", function () {
    this
      .on("shareTokens.marketId", "markets.marketId")
      .andOn("symbol", db.raw("?", "shares"));
  });
  marketsQuery.join("balances", function () {
    this
      .on("balances.token", "shareTokens.contractAddress")
      .andOn("balances.owner", db.raw("?", account));
  });
  marketsQuery.join("payouts", function () {
    this
      .on("payouts.marketId", "markets.marketId")
      .andOn("payouts.winning", db.raw("1"));
  });
  marketsQuery.join("blocks as proceeds_block", "trading_proceeds.blockNumber", "proceeds_block.blockNumber");

  const winningPayoutRows: Array<WinningPayoutRow> = await marketsQuery;

  return _
    .map(winningPayoutRows, (row: WinningPayoutRow): ProceedTradesRow<BigNumber> => {
      const payoutKey = `payout${row.outcome}` as keyof PayoutRow<BigNumber>;
      const payout = row[payoutKey] as BigNumber;
      // this is the same as augur.utils.convertOnChainPriceToDisplayPrice
      // I hate having to get it off an `augur` instance when its unrelated
      // to a connection
      const tickSize = numTicksToTickSize(row.numTicks, row.minPrice, row.maxPrice);
      const amount = row.balance.div(tickSize);
      const price = payout.times(tickSize).plus(row.minPrice);
      return {
        marketId: row.marketId,
        outcome: row.outcome,
        timestamp: row.timestamp,
        amount,
        price,
        type: "sell",
        maker: false,
      };
    });
}
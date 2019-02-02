import Augur from "augur.js";
import * as Knex from "knex";
import { formatBigNumberAsFixed } from "../../utils/format-big-number-as-fixed";
import { BigNumber } from "bignumber.js";
import { FormattedEventLog } from "../../types";
import { augurEmitter } from "../../events";
import { SubscriptionEventNames } from "../../constants";
import { updateProfitLossClaimProceeds, updateProfitLossRemoveRow } from "./profit-loss/update-profit-loss";

interface ShareTokenOutcome {
  outcome: number;
}

interface MarketData {
  numTicks: BigNumber;
  maxPrice: BigNumber;
  minPrice: BigNumber;
  numOutcomes: number;
}

export async function processTradingProceedsClaimedLog(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const tradingProceedsToInsert = formatBigNumberAsFixed({
      marketId: log.market,
      shareToken: log.shareToken,
      account: log.sender,
      numShares: log.numShares,
      numPayoutTokens: log.numPayoutTokens,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
    });

    await db("trading_proceeds").insert(tradingProceedsToInsert);

    await updateProfitLossClaimProceeds(db, log.market, log.sender, log.transactionHash, log.blockNumber, log.transactionIndex);

    augurEmitter.emit(SubscriptionEventNames.TradingProceedsClaimed, log);
  };
}

export async function processTradingProceedsClaimedLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    await db.from("trading_proceeds").where({ transactionHash: log.transactionHash, logIndex: log.logIndex }).del();
    await db.from("profit_loss_timeseries").where({ transactionHash: log.transactionHash }).del();
    await updateProfitLossRemoveRow(db, log.transactionHash);
    augurEmitter.emit(SubscriptionEventNames.TradingProceedsClaimed, log);
  };
}

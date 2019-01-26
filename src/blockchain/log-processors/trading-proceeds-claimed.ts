import Augur from "augur.js";
import * as Knex from "knex";
import { formatBigNumberAsFixed } from "../../utils/format-big-number-as-fixed";
import { BigNumber } from "bignumber.js";
import { FormattedEventLog } from "../../types";
import { augurEmitter } from "../../events";
import { SubscriptionEventNames } from "../../constants";
import { updateProfitLossSellShares } from "./profit-loss/update-profit-loss";
import { numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";

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
    const shareTokenOutcome: ShareTokenOutcome = await db("tokens").first("outcome").where({ contractAddress: log.shareToken});
    const marketData: MarketData = await db.first(["numTicks", "minPrice", "maxPrice", "numOutcomes"]).from("markets").where({ marketId: log.market });

    const minPrice = marketData.minPrice;
    const maxPrice = marketData.maxPrice;
    const numTicks = marketData.numTicks;
    const numOutcomes = marketData.numOutcomes;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const numShares = new BigNumber(log.numShares, 10).dividedBy(tickSize).dividedBy(10 ** 18);
    const payoutTokens = new BigNumber(log.numPayoutTokens).dividedBy(10 ** 18);

    const outcome = numOutcomes === 2 ? 1 : shareTokenOutcome.outcome;

    await updateProfitLossSellShares(db, log.market, numShares, log.sender, [shareTokenOutcome.outcome], payoutTokens, log.transactionHash, log.blockNumber, log.transactionIndex, outcome);
    augurEmitter.emit(SubscriptionEventNames.TradingProceedsClaimed, log);
  };
}

export async function processTradingProceedsClaimedLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    await db.from("trading_proceeds").where({ transactionHash: log.transactionHash, logIndex: log.logIndex }).del();
    await db.from("profit_loss_timeseries").where({ transactionHash: log.transactionHash }).del();
    augurEmitter.emit(SubscriptionEventNames.TradingProceedsClaimed, log);
  };
}

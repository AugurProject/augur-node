import { Augur } from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { CompleteSetsRow, FormattedEventLog, MarketsRow } from "../../types";
import { numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";
import { augurEmitter } from "../../events";
import { SubscriptionEventNames } from "../../constants";
import { updateMarketOpenInterest } from "./order-filled/update-volumetrics";

export async function processCompleteSetsPurchasedOrSoldLog(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const marketId = log.market;
    const marketsRow: MarketsRow<BigNumber>|undefined = await db.first("minPrice", "maxPrice", "numTicks", "numOutcomes").from("markets").where({ marketId });
    if (!marketsRow) throw new Error(`market not found: ${marketId}`);
    const minPrice = marketsRow.minPrice;
    const maxPrice = marketsRow.maxPrice;
    const numTicks = marketsRow.numTicks;
    const numOutcomes = marketsRow.numOutcomes;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const numCompleteSets = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.numCompleteSets, 10), tickSize);
    const completeSetPurchasedData: CompleteSetsRow<string> = {
      marketId,
      account: log.account,
      blockNumber: log.blockNumber,
      universe: log.universe,
      eventName: log.eventName,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      tradeGroupId: log.tradeGroupId,
      numCompleteSets: numCompleteSets.toString(),
      numPurchasedOrSold: numCompleteSets.toString(),
    };
    const eventName = log.eventName as keyof typeof SubscriptionEventNames;
    await db.insert(completeSetPurchasedData).into("completeSets");
    augurEmitter.emit(SubscriptionEventNames[eventName], completeSetPurchasedData);
    await updateMarketOpenInterest(db, marketId);
  };
}

export async function processCompleteSetsPurchasedOrSoldLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    await db.from("completeSets").where({ transactionHash: log.transactionHash, logIndex: log.logIndex }).del();
    const eventName = log.eventName as keyof typeof SubscriptionEventNames;
    augurEmitter.emit(SubscriptionEventNames[eventName], log);
    await updateMarketOpenInterest(db, log.market);
  };
}

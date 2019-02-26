import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { ZERO } from "../../../constants";
import { Address, MarketsRow, PayoutNumerators, TradesRow } from "../../../types";
import { numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { getCurrentTime } from "../../process-block";
import { FrozenFunds, FrozenFundsEvent, getFrozenFundsAfterEventForOneOutcome } from "./frozen-funds";

interface PayoutAndMarket<BigNumberType> extends PayoutNumerators<BigNumberType> {
  minPrice: BigNumber;
  maxPrice: BigNumber;
  numTicks: BigNumber;
}

interface UpdateData extends FrozenFunds {
  price: BigNumber;
  position: BigNumber;
  profit: BigNumber;
}

export async function updateProfitLossClaimProceeds(db: Knex, marketId: Address, account: Address, transactionHash: string, blockNumber: number, logIndex: number): Promise<void> {
  const payouts: PayoutAndMarket<BigNumber> = await db
    .first(["payouts.payout0", "payouts.payout1", "payouts.payout2", "payouts.payout3", "payouts.payout4", "payouts.payout5", "payouts.payout6", "payouts.payout7", "markets.minPrice", "markets.maxPrice", "markets.numTicks"])
    .from("payouts")
    .where("payouts.marketId", marketId)
    .join("markets", function() {
      this.on("payouts.marketId", "markets.marketId");
    });
  let totalPayout = ZERO;
  const outcomeValues: Array<BigNumber> = [];
  const maxPrice = payouts.maxPrice;
  const minPrice = payouts.minPrice;
  const numTicks = payouts.numTicks;
  const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
  for (let i: number = 0; i <= 7; i++) {
    const column = `payout${i}`;
    const payoutValue = payouts[column as keyof PayoutAndMarket<BigNumber>];
    if (payoutValue != null) {
      const value = payoutValue.times(tickSize).plus(minPrice);
      totalPayout = totalPayout.plus(value);
      outcomeValues.push(value);
    }
  }

  for (let outcome: number = 0; outcome <= outcomeValues.length; outcome++) {
    const lastData: UpdateData = await db
      .first(["position"])
      .from("wcl_profit_loss_timeseries")
      .where({ account, marketId, outcome })
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC`);
    const lastPosition = lastData ? lastData.position : ZERO;
    if (!lastPosition.eq(ZERO)) {
      const price = lastPosition.lt(ZERO) ? totalPayout.minus(outcomeValues[outcome]) : outcomeValues[outcome];
      const tradeData = undefined; // the next updateProfitLoss() is associated with claiming proceeds, not a trade, so tradeData is undefined
      await updateProfitLoss(db, marketId, lastPosition.negated(), account, outcome, price, transactionHash, blockNumber, logIndex, tradeData);
    }
  }
}

// If this updateProfitLoss is due to a trade, the passed tradeData
// must be defined (and be data from this associated trade.)
export async function updateProfitLoss(db: Knex, marketId: Address, positionDelta: BigNumber, account: Address, outcome: number, price: BigNumber, transactionHash: string, blockNumber: number, logIndex: number, tradeData?: Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): Promise<void> {
  if (positionDelta.eq(ZERO)) return;

  const timestamp = getCurrentTime();

  const marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice"> = await db("markets").first("minPrice", "maxPrice").where({ marketId });

  price = price.minus(marketsRow.minPrice);

  const lastData: UpdateData = await db
    .first(["price", "position", "profit", "frozenFunds"])
    .from("wcl_profit_loss_timeseries")
    .where({ account, marketId, outcome })
    .orderByRaw(`"blockNumber" DESC, "logIndex" DESC`);

  let oldPosition = lastData ? lastData.position : ZERO;
  let oldPrice = lastData ? lastData.price : ZERO;
  const oldProfit = lastData ? lastData.profit : ZERO;
  const oldFrozenFunds = lastData ? lastData.frozenFunds : ZERO;

  let profit = oldProfit;

  // Adjust postion
  const position = oldPosition.plus(positionDelta);

  // Adjust realized profit for amount of existing position sold
  if (!oldPosition.eq(ZERO) && oldPosition.s !== positionDelta.s) {
    const amountSold = BigNumber.min(oldPosition.abs(), positionDelta.abs());
    const profitDelta = (oldPosition.lt(ZERO) ? oldPrice.minus(price) : price.minus(oldPrice)).multipliedBy(amountSold);
    oldPosition = amountSold.gte(oldPosition.abs()) ? ZERO : oldPosition.plus(positionDelta);
    positionDelta = oldPosition.eq(ZERO) ? position : ZERO;
    profit = profit.plus(profitDelta);
    if (oldPosition.eq(ZERO)) {
      oldPrice = ZERO;
    }
  }

  let newPrice = oldPrice;

  // Adjust price for new position added
  if (!positionDelta.eq(ZERO)) {
    newPrice = (oldPrice.multipliedBy(oldPosition.abs())).plus(price.multipliedBy(positionDelta.abs())).dividedBy(position.abs());
  }

  const nextFrozenFunds = getFrozenFundsAfterEventForOneOutcome({
    frozenFundsBeforeEvent: {
      frozenFunds: oldFrozenFunds,
    },
    event: makeFrozenFundsEvent(account, profit, marketsRow, tradeData),
  });

  const insertData = {
    account,
    marketId,
    outcome,
    price: newPrice.toString(),
    position: position.toString(),
    profit: profit.toString(),
    transactionHash,
    timestamp,
    blockNumber,
    logIndex,
    frozenFunds: nextFrozenFunds.frozenFunds.toString(),
  };

  await db.insert(insertData).into("wcl_profit_loss_timeseries");
}

export async function updateProfitLossRemoveRow(db: Knex, transactionHash: string): Promise<void> {
  // if this tx was rollbacked simply delete any rows correlated with it
  await db("wcl_profit_loss_timeseries")
    .delete()
    .where({ transactionHash });
}

// makeFrozenFundsEvent() is a helper function of updateProfitLoss(). Passed
// tradeData is associated data from the trade for which this user's profit and
// loss requires updating. We'll use tradeData to build a FrozenFundsEvent of type
// Trade, which requires realizedProfit, and that's why the FrozenFundsEvent is
// constructed here after the realizedProfit is computed by updateProfitLoss().
function makeFrozenFundsEvent(account: Address, realizedProfit: BigNumber, marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice">, tradeData?: Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): FrozenFundsEvent {
  if (tradeData === undefined) {
    // tradeData undefined corresponds to a ClaimProceeds event, ie.
    // updateProfitLoss() called in context of user claiming proceeds.
    return "ClaimProceeds";
  }

  // tradeData defined corresponds to a Trade event, ie. updateProfitLoss()
  // called in context of a user having executed a trade.
  let userIsLongOrShort: "long" | "short" | undefined;
  let userIsCreatorOrFiller: "creator" | "filler" | undefined;
  if (account === tradeData.creator) {
    userIsCreatorOrFiller = "creator";
    if (tradeData.orderType === "buy") {
      userIsLongOrShort = "long";
    } else {
      userIsLongOrShort = "short";
    }
  } else if (account === tradeData.filler) {
    userIsCreatorOrFiller = "filler";
    if (tradeData.orderType === "buy") {
      userIsLongOrShort = "short";
    } else {
      userIsLongOrShort = "long";
    }
  } else {
    throw new Error(`makeFrozenFundsEvent: expected passed trade data to have creator or filler equal to passed account, account=${account} tradeCreator=${tradeData.creator} tradeFiller=${tradeData.filler}`);
  }
  const {
    price, numCreatorTokens, numCreatorShares, numFillerTokens, numFillerShares,
  } = tradeData;
  return {
    creatorOrFiller: userIsCreatorOrFiller,
    longOrShort: userIsLongOrShort,
    realizedProfit,
    price,
    numCreatorTokens,
    numCreatorShares,
    numFillerTokens,
    numFillerShares,
    ...marketsRow,
  };
}

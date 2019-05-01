import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { ZERO } from "../../../constants";
import { ProfitLossTimeseries, ProfitLossTimeseriesRow } from "../../../server/getters/get-profit-loss";
import { Address, MarketsRow, PayoutNumerators, TradesRow } from "../../../types";
import { numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { Price, Shares, Tokens } from "../../../utils/dimension-quantity";
import { getNextAverageTradePriceMinusMinPriceForOpenPosition, getNextNetPosition, getNextRealizedCost, getNextRealizedProfit, getTradePriceMinusMinPrice, getTradeQuantityOpened, getTradeRealizedProfitDelta } from "../../../utils/financial-math";
import { getCurrentTime } from "../../process-block";
import { FrozenFundsEvent, getFrozenFundsAfterEventForOneOutcome } from "./frozen-funds";

interface PayoutAndMarket<BigNumberType> extends PayoutNumerators<BigNumberType> {
  minPrice: BigNumber;
  maxPrice: BigNumber;
  numTicks: BigNumber;
}

type UpdateData = Pick<ProfitLossTimeseries, "price" | "position" | "profit" | "realizedCost" | "frozenFunds">;

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
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
    const lastPosition = lastData ? lastData.position : ZERO;
    if (!lastPosition.eq(ZERO)) {
      const price = lastPosition.lt(ZERO) ? totalPayout.minus(outcomeValues[outcome]) : outcomeValues[outcome];
      const tradeData = undefined; // the next updateProfitLoss() is associated with claiming proceeds, not a trade, so tradeData is undefined
      const selfFilled = undefined; // the next updateProfitLoss() is associated with claiming proceeds, not a trade, so selfFilled is undefined
      await updateProfitLoss(db, marketId, lastPosition.negated(), account, selfFilled, outcome, price, transactionHash, blockNumber, logIndex, tradeData);
    }
  }
}

// If this updateProfitLoss is due to a trade, the passed tradeData
// must be defined (and be data from this associated trade.)
export async function updateProfitLoss(db: Knex, marketId: Address, positionDelta: BigNumber, account: Address, selfFilled: undefined | "creator" | "filler", outcome: number, tradePriceBN: BigNumber, transactionHash: string, blockNumber: number, logIndex: number, tradeData: undefined | Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): Promise<void> {
  if (positionDelta.eq(ZERO)) return;

  const tradePositionDelta = new Shares(positionDelta);
  const timestamp = getCurrentTime();

  const marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice"> = await db("markets").first("minPrice", "maxPrice").where({ marketId });

  const marketMinPrice = new Price(marketsRow.minPrice);
  const marketMaxPrice = new Price(marketsRow.maxPrice);
  const tradePrice = new Price(tradePriceBN);

  const { tradePriceMinusMinPrice } = getTradePriceMinusMinPrice({
    marketMinPrice,
    tradePrice,
  });

  const prevData: UpdateData = await db
    .first(["price", "position", "profit", "frozenFunds", "realizedCost"])
    .from("wcl_profit_loss_timeseries")
    .where({ account, marketId, outcome })
    .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);

  const netPosition: Shares = prevData ? new Shares(prevData.position) : Shares.ZERO;
  const averageTradePriceMinusMinPriceForOpenPosition = prevData ? new Price(prevData.price) : Price.ZERO;
  const realizedCost = prevData ? new Tokens(prevData.realizedCost) : Tokens.ZERO;
  const realizedProfit = prevData ? new Tokens(prevData.profit) : Tokens.ZERO;
  const frozenFunds = prevData ? prevData.frozenFunds : ZERO;

  const { tradeQuantityOpened } = getTradeQuantityOpened({
    netPosition,
    tradePositionDelta,
  });
  const { nextNetPosition } = getNextNetPosition({
    netPosition,
    tradePositionDelta,
  });
  const { nextRealizedProfit } = getNextRealizedProfit({
    realizedProfit,
    marketMinPrice,
    marketMaxPrice,
    netPosition,
    averageTradePriceMinusMinPriceForOpenPosition,
    tradePositionDelta,
    tradePriceMinusMinPrice,
  });
  const { nextRealizedCost } = getNextRealizedCost({
    realizedCost,
    marketMinPrice,
    marketMaxPrice,
    netPosition,
    tradePositionDelta,
    averageTradePriceMinusMinPriceForOpenPosition,
  });
  const { nextAverageTradePriceMinusMinPriceForOpenPosition } =
    getNextAverageTradePriceMinusMinPriceForOpenPosition({
      netPosition,
      averageTradePriceMinusMinPriceForOpenPosition,
      tradePositionDelta,
      tradePriceMinusMinPrice,
    });
  const { tradeRealizedProfitDelta } = getTradeRealizedProfitDelta({
    marketMinPrice,
    marketMaxPrice,
    netPosition,
    averageTradePriceMinusMinPriceForOpenPosition,
    tradePositionDelta,
    tradePriceMinusMinPrice,
  });
  const nextFrozenFunds = getFrozenFundsAfterEventForOneOutcome({
    frozenFundsBeforeEvent: { frozenFunds },
    event: makeFrozenFundsEvent(account, selfFilled, tradeRealizedProfitDelta.magnitude, marketsRow, tradeData),
  });

  const nextProfitLossTimeseries: ProfitLossTimeseriesRow<string> = {
    account,
    marketId,
    outcome,
    price: nextAverageTradePriceMinusMinPriceForOpenPosition.magnitude.toString(),
    position: nextNetPosition.magnitude.toString(),
    quantityOpened: tradeQuantityOpened.magnitude.toString(),
    profit: nextRealizedProfit.magnitude.toString(),
    transactionHash,
    timestamp,
    blockNumber,
    logIndex,
    frozenFunds: nextFrozenFunds.frozenFunds.toString(),
    realizedCost: nextRealizedCost.magnitude.toString(),
  };

  await db.insert(nextProfitLossTimeseries).into("wcl_profit_loss_timeseries");
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
function makeFrozenFundsEvent(account: Address, selfFilled: undefined | "creator" | "filler", realizedProfitDelta: BigNumber, marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice">, tradeData?: Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): FrozenFundsEvent {
  if (tradeData === undefined) {
    // tradeData undefined corresponds to a ClaimProceeds event, ie.
    // updateProfitLoss() called in context of user claiming proceeds.
    return {
      claimProceedsEvent: true,
    };
  }

  // tradeData is defined which corresponds to a Trade event, ie. updateProfitLoss()
  // called in context of a user having executed a trade.

  // If this trade is self-filled (ie. creator == filler), then we still need each
  // side of the trade to be processed independently (at least) for P&L and frozen
  // funds. Moreover, frozen funds has special logic if user is creator, so we need
  // to ensure that a self-filled trade is processed once as "user == filler" and
  // once as "user == creator": this is what `selfFilled` is for; if `selfFilled` is
  // defined, this trade is self-filled and we should override user == creator/filler
  // using the contents of `selfFilled`, see bottom of processOrderFilledLog.
  const userIsCreatorOrFiller: "creator" | "filler" = (() => {
    if (selfFilled !== undefined) return selfFilled; // this trade is self-filled; override userIsCreatorOrFiller to value of selfFilled, see bottom of processOrderFilledLog
    else if (account === tradeData.creator) return "creator";
    else if (account === tradeData.filler) return "filler";
    throw new Error(`makeFrozenFundsEvent: expected passed trade data to have creator or filler equal to passed account, account=${account} tradeCreator=${tradeData.creator} tradeFiller=${tradeData.filler}`);
  })();

  const userIsLongOrShort: "long" | "short" = (() => {
    if (userIsCreatorOrFiller === "creator") {
      if (tradeData.orderType === "buy") {
        return "long";
      } else {
        return "short";
      }
    }
    if (tradeData.orderType === "buy") {
      return "short";
    } else {
      return "long";
    }
  })();

  const {
    price, numCreatorTokens, numCreatorShares, numFillerTokens, numFillerShares,
  } = tradeData;
  return {
    tradeEvent: true,
    isSelfFilled: tradeData.creator === tradeData.filler,
    creatorOrFiller: userIsCreatorOrFiller,
    longOrShort: userIsLongOrShort,
    realizedProfitDelta,
    price,
    numCreatorTokens,
    numCreatorShares,
    numFillerTokens,
    numFillerShares,
    ...marketsRow,
  };
}

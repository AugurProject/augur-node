import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { ZERO } from "../../../constants";
import { Address, MarketsRow, PayoutNumerators, TradesRow } from "../../../types";
import { numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { getCurrentTime } from "../../process-block";
import { FrozenFunds, FrozenFundsEvent, getFrozenFundsAfterEventForOneOutcome } from "./frozen-funds";
import { tradeGetQuantityClosed } from "../../../utils/financial-math";
import { Tokens, Shares, Price } from "../../../utils/dimension-quantity";

interface PayoutAndMarket<BigNumberType> extends PayoutNumerators<BigNumberType> {
  minPrice: BigNumber;
  maxPrice: BigNumber;
  numTicks: BigNumber;
}

// TODO UpdateData should instead be Pick<ProfitLossTimeseries<BigNumber>, ...>
interface UpdateData extends FrozenFunds {
  price: BigNumber;
  position: BigNumber;
  profit: BigNumber;
  realizedCost: BigNumber;
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
export async function updateProfitLoss(db: Knex, marketId: Address, positionDelta: BigNumber, account: Address, outcome: number, price: BigNumber, transactionHash: string, blockNumber: number, logIndex: number, tradeData: undefined | Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): Promise<void> {
  if (positionDelta.eq(ZERO)) return;

  const positionDeltaShares = new Shares(positionDelta);

  const timestamp = getCurrentTime();

  const marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice"> = await db("markets").first("minPrice", "maxPrice").where({ marketId });

  price = price.minus(marketsRow.minPrice);

  const lastData: UpdateData = await db
    .first(["price", "position", "profit", "frozenFunds", "realizedCost"])
    .from("wcl_profit_loss_timeseries")
    .where({ account, marketId, outcome })
    .orderByRaw(`"blockNumber" DESC, "logIndex" DESC`);

  // TODO standardize identifiers around prev/next?
  const oldPositionShares: Shares = lastData ? new Shares(lastData.position) : Shares.sentinel;
  let oldPosition = lastData ? lastData.position : ZERO;
  const constOldPrice = lastData ? new Price(lastData.price) : Price.sentinel; // TODO clean up
  let oldPrice = constOldPrice.magnitude;
  const oldProfit = lastData ? lastData.profit : ZERO;
  const oldFrozenFunds = lastData ? lastData.frozenFunds : ZERO;
  const prevRealizedCost = lastData ? new Tokens(lastData.realizedCost) : Tokens.sentinel;

  let profit = oldProfit;

  // Adjust postion
  const position = oldPosition.plus(positionDelta);

  const quantityClosed: Shares = tradeGetQuantityClosed(oldPositionShares, positionDeltaShares);

  // Adjust realized profit for amount of existing position sold
  if (!oldPosition.eq(ZERO) && oldPosition.s !== positionDelta.s) { // TODO this sign comparsion should use embedded design principle, eg. isPositionClose(oldPosition, positionDelta)
    const profitDelta = (oldPosition.lt(ZERO) ? oldPrice.minus(price) : price.minus(oldPrice)).multipliedBy(quantityClosed.magnitude);
    profit = profit.plus(profitDelta);
    // BEGIN SIMPLIFY1
    oldPosition = quantityClosed.magnitude.gte(oldPosition.abs()) ? ZERO : oldPosition.plus(positionDelta); // set oldPosition to ZERO if position was entirely closed out this trade; otherwise set oldPosition to nextPosition
    positionDelta = oldPosition.eq(ZERO) ? position : ZERO; // set positionDelta to nextPosition if position was entirely closed out this trade; otherwise set positionDelta to zero
    if (oldPosition.eq(ZERO)) {
      oldPrice = ZERO;
    }
    // END SIMPLIFY1
    /*
      // TODO phase1: simplify above logic:
      // TODO phase2: make everything maximally const
        I think we can simplify this into a few cases:
          open position
          partially close position
          fully close position
          [fully close position, open position] = reverse position
            --> reverse algorithm should be concatenation of these algorithms, not a new algorithm
      // SIMPLIFY1 replacement code:
      if (amountSold.gte(oldPosition.abs())) {
        // position entirely closed out this trade
        oldPosition = ZERO
        positionDelta = nextPosition
        oldPrice = ZERO; // ie. averagePrice resets each new position, is memoryless of previous positions
      } else {
        // position partially closed out this trade
        oldPosition = nextPosition
        positionDelta = ZERO
      }
      // invariant: oldPosition + position == nextPosition && one of them is ZERO
    */
  }

  let newPrice = oldPrice;

  // Adjust price for new position added
  if (!positionDelta.eq(ZERO)) {
    newPrice = (oldPrice.multipliedBy(oldPosition.abs())).plus(price.multipliedBy(positionDelta.abs())).dividedBy(position.abs());
    /*
      understanding this formula-
      consider
        oldPrice = 0.2
        oldPosition = 1000
        price = 0.1
        positionDelta = -999
        position = oldPosition + positionDelta = 1
      then
        // WRONG because position was partially closed out
        (0.2*1000 + 0.1*999) / 1 = 99.9
      but, if position was partially closed out this trade
        (see SIMPLIFY11 replacement code above)
        consolidating these:
          if position entirely closed out this trade:
            oldPosition = ZERO
            positionDelta = nextPosition
          otherwise
            oldPosition = nextPosition
            positionDelta = ZERO
      then example becomes
        // position not entirely closed out:
        oldPosition = nextPosition = 1
        positionDelta = 0
      then
        (0.2*1 + 0.1*0)/1 = 0.2 = (oldPrice*nextPosition + price*0)/nextPosition = oldPrice
        // invariant: averagePrice = prevAveragePrice if position partially closed
    */
  }

  const nextFrozenFunds = getFrozenFundsAfterEventForOneOutcome({
    frozenFundsBeforeEvent: {
      frozenFunds: oldFrozenFunds,
    },
    event: makeFrozenFundsEvent(account, profit.minus(oldProfit), marketsRow, tradeData),
  });

  const realizedCostDelta = quantityClosed.multipliedBy(constOldPrice).expect(Tokens); // TODO doc
  const nextRealizedCost = prevRealizedCost.plus(realizedCostDelta); // TODO doc

  // TODO strongly type as ProfitLossTimeseries<BigNumberType>; move ProfitLossTimeseries to types.ts and parameterize BigNumberType; unsure about ProfitLossTimeseries.minPrice, what does that do and why isn't it here?; this can even be ProfitLossTimeseries<string> so that compiler whines when I forget .toString()
  const nextProfitLossTimeseries = {
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
function makeFrozenFundsEvent(account: Address, realizedProfitDelta: BigNumber, marketsRow: Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice">, tradeData?: Pick<TradesRow<BigNumber>, "orderType" | "creator" | "filler" | "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">): FrozenFundsEvent {
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
    realizedProfitDelta,
    price,
    numCreatorTokens,
    numCreatorShares,
    numFillerTokens,
    numFillerShares,
    ...marketsRow,
  };
}

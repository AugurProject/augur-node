import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Address, PayoutNumerators } from "../../../types";
import { getCurrentTime } from "../../process-block";
import { numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { ZERO } from "../../../constants";

interface PayoutAndMarket<BigNumberType> extends PayoutNumerators<BigNumberType> {
  minPrice: BigNumber;
  maxPrice: BigNumber;
  numTicks: BigNumber;
}

interface UpdateData {
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
      await updateProfitLoss(db, marketId, lastPosition.negated(), account, outcome, price, transactionHash, blockNumber, logIndex);
    }
  }
}

export async function updateProfitLoss(db: Knex, marketId: Address, positionDelta: BigNumber, account: Address, outcome: number, price: BigNumber, transactionHash: string, blockNumber: number, logIndex: number): Promise<void> {
  if (positionDelta.eq(ZERO)) return;

  const timestamp = getCurrentTime();

  const minPriceRow: {minPrice: BigNumber} = await db("markets").first("minPrice").where({ marketId });

  price = price.minus(minPriceRow.minPrice);

  const lastData: UpdateData = await db
      .first(["price", "position", "profit"])
      .from("wcl_profit_loss_timeseries")
      .where({ account, marketId, outcome })
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC`);

  let oldPosition = lastData ? lastData.position : ZERO;
  let oldPrice = lastData ? lastData.price : ZERO;
  const oldProfit = lastData ? lastData.profit : ZERO;

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
  };

  await db.insert(insertData).into("wcl_profit_loss_timeseries");
}

export async function updateProfitLossRemoveRow(db: Knex, transactionHash: string): Promise<void> {
  // if this tx was rollbacked simply delete any rows correlated with it
  await db("wcl_profit_loss_timeseries")
    .delete()
    .where({ transactionHash });
}

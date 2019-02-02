import { Augur } from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { ZERO } from "../../../constants";
import { Address, Bytes32, Int256, OrderState } from "../../../types";
import { formatOrderAmount } from "../../../utils/format-order";
import { formatBigNumberAsFixed } from "../../../utils/format-big-number-as-fixed";

interface OrderFilledRow {
  fullPrecisionAmount: BigNumber;
  sharesEscrowed: BigNumber;
  tokensEscrowed: BigNumber;
  outcome: number;
  price: BigNumber;
}

export async function updateOrder(db: Knex, augur: Augur, marketId: Address, orderId: Bytes32, amount: BigNumber, price: BigNumber, numCreatorShares: BigNumber, numCreatorTokens: BigNumber) {
  const orderRow: OrderFilledRow = await db("orders").first("fullPrecisionAmount", "outcome", "price", "sharesEscrowed", "tokensEscrowed").where({ orderId });
  if (orderRow == null) throw new Error(`Could not fetch order amount for order ${orderId}`);
  const fullPrecisionAmountRemainingInOrder = orderRow.fullPrecisionAmount.minus(amount);
  const amountRemainingInOrder = formatOrderAmount(fullPrecisionAmountRemainingInOrder);
  const numSharesEscrowedRemainingInOrder = orderRow.sharesEscrowed.minus(numCreatorShares);
  const numTokensEscrowedRemainingInOrder = orderRow.tokensEscrowed.minus(numCreatorTokens);
  const updateAmountsParams = { fullPrecisionAmount: fullPrecisionAmountRemainingInOrder, amount: amountRemainingInOrder, sharesEscrowed: numSharesEscrowedRemainingInOrder, tokensEscrowed: numTokensEscrowedRemainingInOrder };
  const orderState = fullPrecisionAmountRemainingInOrder.eq(ZERO) ? OrderState.FILLED : OrderState.OPEN;
  const updateParams = Object.assign({ orderState }, updateAmountsParams);
  await db("outcomes").where({ marketId, outcome: orderRow.outcome }).update({ price: price.toString() });
  await db("orders").where({ orderId }).update(formatBigNumberAsFixed(updateParams));
}

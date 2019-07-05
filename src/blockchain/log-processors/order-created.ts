import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { QueryBuilder } from "knex";
import { BN_WEI_PER_ETHER, SubscriptionEventNames } from "../../constants";
import { augurEmitter } from "../../events";
import { Address, FormattedEventLog, MarketsRow, OrdersRow, OrderState, TokensRow } from "../../types";
import { fixedPointToDecimal, numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";
import { formatOrderAmount, formatOrderPrice } from "../../utils/format-order";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../../utils/liquidity";

export async function processOrderCreatedLog(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const amount: BigNumber = new BigNumber(log.amount, 10);
    const price: BigNumber = new BigNumber(log.price, 10);
    const orderType: string = log.orderType;
    const moneyEscrowed: BigNumber = new BigNumber(log.moneyEscrowed, 10);
    const sharesEscrowed: BigNumber = new BigNumber(log.sharesEscrowed, 10);
    const shareToken: Address = log.shareToken;
    const tokensRow: TokensRow | undefined = await db.first("marketId", "outcome").from("tokens").where({ contractAddress: shareToken });
    if (!tokensRow) throw new Error(`market and outcome not found for shareToken ${shareToken} (${log.transactionHash}`);
    const marketId = tokensRow.marketId;
    const outcome = tokensRow.outcome!;
    const marketsRow: MarketsRow<BigNumber> = await db.first("minPrice", "maxPrice", "numTicks", "numOutcomes").from("markets").where({ marketId });
    if (!marketsRow) throw new Error(`market not found: ${marketId}`);
    const minPrice = marketsRow.minPrice;
    const maxPrice = marketsRow.maxPrice;
    const numTicks = marketsRow.numTicks;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const numOutcomes = marketsRow.numOutcomes;
    const fullPrecisionAmount = augur.utils.convertOnChainAmountToDisplayAmount(amount, tickSize);
    const fullPrecisionPrice = augur.utils.convertOnChainPriceToDisplayPrice(price, minPrice, tickSize);
    const orderTypeLabel = orderType === "0" ? "buy" : "sell";
    const displaySharesEscrowed = augur.utils.convertOnChainAmountToDisplayAmount(sharesEscrowed, tickSize).toString();
    const displayTokensEscrowed = fixedPointToDecimal(moneyEscrowed, BN_WEI_PER_ETHER).toString();
    const orderData: OrdersRow<string> = {
      marketId,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      outcome,
      shareToken,
      orderCreator: log.creator,
      orderState: OrderState.OPEN,
      tradeGroupId: log.tradeGroupId,
      orderType: orderTypeLabel,
      price: formatOrderPrice(orderTypeLabel, minPrice, maxPrice, fullPrecisionPrice),
      amount: formatOrderAmount(fullPrecisionAmount),
      originalAmount: formatOrderAmount(fullPrecisionAmount),
      fullPrecisionPrice: fullPrecisionPrice.toString(),
      fullPrecisionAmount: fullPrecisionAmount.toString(),
      originalFullPrecisionAmount: fullPrecisionAmount.toString(),
      originalTokensEscrowed: displayTokensEscrowed,
      originalSharesEscrowed: displaySharesEscrowed,
      tokensEscrowed: displayTokensEscrowed,
      sharesEscrowed: displaySharesEscrowed,
    };
    const orderId = { orderId: log.orderId };
    const ordersRows: Array<Partial<OrdersRow<BigNumber>>> = await db.select("marketId").from("orders").where(orderId);
    let upsertOrder: QueryBuilder;
    if (!ordersRows || !ordersRows.length) {
      upsertOrder = db.insert(Object.assign(orderData, orderId)).into("orders");
    } else {
      upsertOrder = db.from("orders").where(orderId).update(orderData);
    }
    await upsertOrder;
    await marketPendingOrderbookUpdates(db, orderData);
    augurEmitter.emit(SubscriptionEventNames.OrderCreated, Object.assign({}, log, orderData));
  };
}

export async function processOrderCreatedLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const marketIdQuery: Pick<OrdersRow<BigNumber>, "marketId"> = await db.first("marketId").from("orders").where("orderId", log.orderId);
    if (!marketIdQuery) throw new Error(`expected to find order with id ${log.orderId}`);
    await db.from("orders").where("orderId", log.orderId).delete();
    await updateLiquidityMetricsForMarketAndOutcomes(db, marketIdQuery.marketId);
    augurEmitter.emit(SubscriptionEventNames.OrderCreated, log);
  };
}

async function marketPendingOrderbookUpdates(db: Knex, orderData: OrdersRow<string>) {
  const pendingOrderData = {
    marketId: orderData.marketId,
    outcome: orderData.outcome,
    orderType: orderData.orderType,
  };
  const result: { count: number } = await db.first(db.raw("count(*) as count")).from("pending_orphan_checks").where(pendingOrderData);
  if (result.count === 0) {
    await db.insert(pendingOrderData).into("pending_orphan_checks");
  }
  const liquidityResult: { count: number } = await db.first(db.raw("count(*) as count")).from("pending_liquidity_updates").where({marketId: orderData.marketId});
  if (liquidityResult.count > 0) return;
  return await db.insert({marketId: orderData.marketId}).into("pending_liquidity_updates");
}

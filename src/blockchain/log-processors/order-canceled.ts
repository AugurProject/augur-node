import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { SubscriptionEventNames } from "../../constants";
import { augurEmitter } from "../../events";
import { Bytes32, FormattedEventLog, OrderState } from "../../types";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../../utils/liquidity";

interface MarketIDAndOutcomeAndPrice {
  marketId: Bytes32;
  outcome: number;
  price: BigNumber;
  orderType: string | number;
  orderCreator: string;
  sharesEscrowed: BigNumber;
}

interface MarketNumOutcomes {
  numOutcomes: number;
}

export async function processOrderCanceledLog(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const orderTypeLabel = log.orderType === "0" ? "buy" : "sell";
    await db.from("orders").where("orderId", log.orderId).update({ orderState: OrderState.CANCELED });
    await db.into("orders_canceled").insert({ orderId: log.orderId, transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber });
    const ordersRow: MarketIDAndOutcomeAndPrice = await db.first("marketId", "outcome", "price", "sharesEscrowed", "orderCreator").from("orders").where("orderId", log.orderId);
    if (!ordersRow) throw new Error(`expected to find order with id ${log.orderId}`);
    ordersRow.orderType = orderTypeLabel;
    const liquidityResult: { count: number } = await db.first(db.raw("count(*) as count")).from("pending_liquidity_updates").where({marketId: ordersRow.marketId});
    if (liquidityResult.count === 0) {
      await db.insert({marketId: ordersRow.marketId}).into("pending_liquidity_updates");
    }
    augurEmitter.emit(SubscriptionEventNames.OrderCanceled, Object.assign({}, log, ordersRow));
  };
}

export async function processOrderCanceledLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const orderTypeLabel = log.orderType === "0" ? "buy" : "sell";
    await db.from("orders").where("orderId", log.orderId).update({ orderState: OrderState.OPEN });
    await db.from("orders_canceled").where("orderId", log.orderId).delete();
    const ordersRow: MarketIDAndOutcomeAndPrice = await db.first("marketId", "outcome", "price").from("orders").where("orderId", log.orderId);
    if (!ordersRow) throw new Error(`expected to find order with id ${log.orderId}`);
    ordersRow.orderType = orderTypeLabel;
    await updateLiquidityMetricsForMarketAndOutcomes(db, ordersRow.marketId);
    augurEmitter.emit(SubscriptionEventNames.OrderCanceled, Object.assign({}, log, ordersRow));
  };
}

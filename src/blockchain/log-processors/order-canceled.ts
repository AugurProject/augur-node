import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { SubscriptionEventNames } from "../../constants";
import { augurEmitter } from "../../events";
import { getDefaultPLTimeseries, ProfitLossTimeseriesRow } from "../../server/getters/get-profit-loss";
import { Bytes32, FormattedEventLog, OrdersRow, OrderState } from "../../types";
import { FrozenFunds, getFrozenFundsAfterEventForOneOutcome } from "./profit-loss/frozen-funds";
import { getCurrentTime } from "../process-block";

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
    const { tokensEscrowed }: Pick<OrdersRow<BigNumber>, "tokensEscrowed"> = await db
      .first("orders.tokensEscrowed")
      .from("orders")
      .where({ orderId: log.orderId })
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC`);
    if (!tokensEscrowed) throw new Error(`order id not found: ${{ orderId: log.orderId }}`);

    const prevProfitLoss: undefined | ProfitLossTimeseriesRow<BigNumber> = await db
      .first("wcl_profit_loss_timeseries.*")
      .from("wcl_profit_loss_timeseries")
      .join("orders", function(this: any) {
        this.on(function(this: any) {
          this.on("wcl_profit_loss_timeseries.marketId", "=", "orders.marketId");
          this.andOn("wcl_profit_loss_timeseries.outcome", "=", "wcl_profit_loss_timeseries.outcome");
        });
      })
      .whereRaw("wcl_profit_loss_timeseries.account = orders.orderCreator")
      .where({ orderId: log.orderId })
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "wcl_profit_loss_timeseries.rowid" DESC`);

    if (!prevProfitLoss) throw new Error(`expected to find previous wcl_profit_loss_timeseries on order cancel orderId=${log.orderId}`);

    const orderTypeLabel = log.orderType === "0" ? "buy" : "sell";
    await db.from("orders").where("orderId", log.orderId).update({ orderState: OrderState.CANCELED });
    await db.into("orders_canceled").insert({ orderId: log.orderId, transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber });

    const nextFrozenFunds: FrozenFunds = getFrozenFundsAfterEventForOneOutcome({
      frozenFundsBeforeEvent: prevProfitLoss,
      event: {
        orderCanceledEvent: true,
        tokensEscrowed,
      },
    });

    const nextProfitLoss: ProfitLossTimeseriesRow<string> = Object.assign({}, prevProfitLoss, {
      timestamp: getCurrentTime(),
      price: prevProfitLoss.price.toString(),
      position: prevProfitLoss.position.toString(),
      quantityOpened: prevProfitLoss.quantityOpened.toString(),
      profit: prevProfitLoss.profit.toString(),
      realizedCost: prevProfitLoss.realizedCost.toString(),
      frozenFunds: nextFrozenFunds.frozenFunds.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
    await db.insert(nextProfitLoss).into("wcl_profit_loss_timeseries");

    const ordersRow: MarketIDAndOutcomeAndPrice = await db.first("marketId", "outcome", "price", "sharesEscrowed", "orderCreator").from("orders").where("orderId", log.orderId);
    ordersRow.orderType = orderTypeLabel;
    augurEmitter.emit(SubscriptionEventNames.OrderCanceled, Object.assign({}, log, ordersRow));
  };
}

export async function processOrderCanceledLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    await db("wcl_profit_loss_timeseries")
      .delete()
      .where({ transactionHash: log.transactionHash });
    const orderTypeLabel = log.orderType === "0" ? "buy" : "sell";
    await db.from("orders").where("orderId", log.orderId).update({ orderState: OrderState.OPEN });
    await db.from("orders_canceled").where("orderId", log.orderId).delete();
    const ordersRow: MarketIDAndOutcomeAndPrice = await db.first("marketId", "outcome", "price").from("orders").where("orderId", log.orderId);
    if (ordersRow) ordersRow.orderType = orderTypeLabel;
    augurEmitter.emit(SubscriptionEventNames.OrderCanceled, Object.assign({}, log, ordersRow));
  };
}

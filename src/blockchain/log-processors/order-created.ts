import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import * as Knex from "knex";
import { QueryBuilder } from "knex";
import { BN_WEI_PER_ETHER, SubscriptionEventNames } from "../../constants";
import { augurEmitter } from "../../events";
import { getDefaultPLTimeseries, ProfitLossTimeseriesRow } from "../../server/getters/get-profit-loss";
import { Address, FormattedEventLog, MarketsRow, OrdersRow, OrderState, TokensRow } from "../../types";
import { fixedPointToDecimal, numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";
import { formatOrderAmount, formatOrderPrice } from "../../utils/format-order";
import { FrozenFunds, getFrozenFundsAfterEventForOneOutcome } from "./profit-loss/frozen-funds";
import { getCurrentTime } from "../process-block";

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

    const prevProfitLossQuery: undefined | ProfitLossTimeseriesRow<BigNumber> =
      await db
      .first()
      .from("wcl_profit_loss_timeseries")
      .where({ account: log.creator, marketId, outcome })
      .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);

    const prevProfitLoss: ProfitLossTimeseriesRow<BigNumber> = prevProfitLossQuery || Object.assign((() => {
      const pl = getDefaultPLTimeseries();
      // These market properties are in ProfitLossTimeseries, but not
      // ProfitLossTimeseriesRow, and need to be deleted, or inserting
      // into wcl_profit_loss_timeseries below will throw error.
      delete pl.minPrice;
      delete pl.maxPrice;
      delete pl.numOutcomes;
      return pl;
    })(), {
      account: log.creator,
      marketId,
      outcome,
      blockNumber: 0,
      logIndex: 0,
    });

    const minPrice = marketsRow.minPrice;
    const maxPrice = marketsRow.maxPrice;
    const numTicks = marketsRow.numTicks;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const numOutcomes = marketsRow.numOutcomes;
    const fullPrecisionAmount = augur.utils.convertOnChainAmountToDisplayAmount(amount, tickSize);
    const fullPrecisionPrice = augur.utils.convertOnChainPriceToDisplayPrice(price, minPrice, tickSize);
    const orderTypeLabel = orderType === "0" ? "buy" : "sell";
    const displaySharesEscrowed = augur.utils.convertOnChainAmountToDisplayAmount(sharesEscrowed, tickSize).toString();
    const displayTokensEscrowedBN = fixedPointToDecimal(moneyEscrowed, BN_WEI_PER_ETHER);
    const displayTokensEscrowed = displayTokensEscrowedBN.toString();
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
    await marketPendingOrphanCheck(db, orderData);

    const nextFrozenFunds: FrozenFunds = getFrozenFundsAfterEventForOneOutcome({
      frozenFundsBeforeEvent: prevProfitLoss,
      event: {
        orderCreatedEvent: true,
        originalTokensEscrowed: displayTokensEscrowedBN,
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

    augurEmitter.emit(SubscriptionEventNames.OrderCreated, Object.assign({}, log, orderData));
  };
}

export async function processOrderCreatedLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    await db("wcl_profit_loss_timeseries")
      .delete()
      .where({ transactionHash: log.transactionHash });
    await db.from("orders").where("orderId", log.orderId).delete();
    augurEmitter.emit(SubscriptionEventNames.OrderCreated, log);
  };
}

async function marketPendingOrphanCheck(db: Knex, orderData: OrdersRow<string>) {
  const pendingOrderData = {
    marketId: orderData.marketId,
    outcome: orderData.outcome,
    orderType: orderData.orderType,
  };
  const result: { count: number } = await db.first(db.raw("count(*) as count")).from("pending_orphan_checks").where(pendingOrderData);
  if (result.count > 0) return;
  return await db.insert(pendingOrderData).into("pending_orphan_checks");
}

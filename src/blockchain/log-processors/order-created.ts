import Augur from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Address, FormattedEventLog, MarketsRow, OrdersRow, TokensRow, OrderState, ErrorCallback } from "../../types";
import { augurEmitter } from "../../events";
import { fixedPointToDecimal, numTicksToTickSize } from "../../utils/convert-fixed-point-to-decimal";
import { formatOrderAmount, formatOrderPrice } from "../../utils/format-order";
import { BN_WEI_PER_ETHER} from "../../constants";
import { QueryBuilder } from "knex";

const MAX_LOGS_PER_BLOCK = 100000;

export function processOrderCreatedLog(db: Knex, augur: Augur, log: FormattedEventLog, callback: ErrorCallback): void {
  const amount: BigNumber = new BigNumber(log.amount, 10);
  const price: BigNumber = new BigNumber(log.price, 10);
  const orderType: string = log.orderType;
  const moneyEscrowed: BigNumber = new BigNumber(log.moneyEscrowed, 10);
  const sharesEscrowed: BigNumber = new BigNumber(log.sharesEscrowed, 10);
  const shareToken: Address = log.shareToken;
  db.first("marketId", "outcome").from("tokens").where({ contractAddress: shareToken }).asCallback((err: Error|null, tokensRow?: TokensRow): void => {
    if (err) return callback(err);
    if (!tokensRow) return callback(new Error(`market and outcome not found for shareToken ${shareToken} (${log.transactionHash}`));
    const marketId = tokensRow.marketId!;
    const outcome = tokensRow.outcome!;
    db.first("minPrice", "maxPrice", "numTicks").from("markets").where({ marketId }).asCallback((err: Error|null, marketsRow?: MarketsRow<BigNumber>): void => {
      if (err) return callback(err);
      if (!marketsRow) return callback(new Error(`market min price, max price, and/or num ticks not found for market: ${marketId} (${log.transactionHash}`));
      const minPrice = marketsRow.minPrice!;
      const maxPrice = marketsRow.maxPrice!;
      const numTicks = marketsRow.numTicks!;
      const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
      const fullPrecisionAmount = augur.utils.convertOnChainAmountToDisplayAmount(amount, tickSize);
      const fullPrecisionPrice = augur.utils.convertOnChainPriceToDisplayPrice(price, minPrice, tickSize);
      const orderTypeLabel = orderType === "0" ? "buy" : "sell";
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
        fullPrecisionPrice: fullPrecisionPrice.toFixed(),
        fullPrecisionAmount: fullPrecisionAmount.toFixed(),
        originalFullPrecisionAmount: fullPrecisionAmount.toFixed(),
        tokensEscrowed: fixedPointToDecimal(moneyEscrowed, BN_WEI_PER_ETHER).toFixed(),
        sharesEscrowed: augur.utils.convertOnChainAmountToDisplayAmount(sharesEscrowed, tickSize).toFixed(),
      };
      const orderId = { orderId: log.orderId };
      checkForOrphanedOrders(db, orderData, (err) => {
        if (err) return callback(err);
        db.select("marketId").from("orders").where(orderId).asCallback((err: Error|null, ordersRows?: Array<Partial<OrdersRow<BigNumber>>>): void => {
          if (err) return callback(err);
          let upsertOrder: QueryBuilder;
          if (!ordersRows || !ordersRows.length) {
            upsertOrder = db.insert(Object.assign(orderData, orderId)).into("orders");
          } else {
            upsertOrder = db.from("orders").where(orderId).update(orderData);
          }
          upsertOrder.asCallback((err: Error|null): void => {
            if (err) return callback(err);
            augurEmitter.emit("OrderCreated", Object.assign({}, log, orderData));
            callback(null);
          });
        });
      });
    });
  });
}

export function processOrderCreatedLogRemoval(db: Knex, augur: Augur, log: FormattedEventLog, callback: ErrorCallback): void {
  db.from("orders").where("orderId", log.orderId).delete().asCallback((err: Error|null): void => {
    if (err) return callback(err);
    unOrphanOrders(db, log, (err) => {
      if (err) return callback(err);
      augurEmitter.emit("OrderCreated", log);
      return callback(null);
    });
  });
}

function checkForOrphanedOrders(db: Knex, orderData: OrdersRow<string>, callback: ErrorCallback): void {
  const queryData = {
    marketId: orderData.marketId,
    outcome: orderData.outcome,
    orderType: orderData.orderType,
  };
  db.first([db.raw("count(*) as numOrders"), db.raw("count(distinct(fullPrecisionPrice)) as numPrices"), db.raw("min(fullPrecisionPrice) as fullPrecisionPrice")]).from("orders").where(queryData).where("amount", "!=", "0").asCallback((err: Error|null, results: { numOrders: number, numPrices: number, fullPrecisionPrice: string }): void => {
    if (err) return callback(err);
    if (results.numOrders < 2) return callback(null);
    const onBookPrice = new BigNumber(results.fullPrecisionPrice);
    const newOrderPrice = new BigNumber(orderData.fullPrecisionPrice);
    const orderType = queryData.orderType === "buy" ? 0 : 1;
    const worseOrEqualPrice = orderType === 0 ? newOrderPrice.lte(onBookPrice) : newOrderPrice.gte(onBookPrice);
    if (results.numPrices === 1 && results.numOrders > 1 && worseOrEqualPrice) {
      db.from("orders").first(db.raw("MAX(blockNumber * ?? + logIndex) as maxLog", [MAX_LOGS_PER_BLOCK])).where(queryData).asCallback((err: Error|null, result: {maxLog: number}): void => {
        if (err) return callback(err);
        db.from("orders").where(db.raw("(blockNumber * ?? + logIndex) == ??", [MAX_LOGS_PER_BLOCK, result.maxLog])).update({orphaned: true}).asCallback((err) => {
          if (err) return callback(err);
          return callback(null);
        });
      });
    } else {
      return callback(null);
    }
  });
}

function unOrphanOrders(db: Knex, log: FormattedEventLog, callback: ErrorCallback): void {
  db.first("marketId", "outcome").from("tokens").where({ contractAddress: log.shareToken }).asCallback((err: Error|null, tokensRow?: TokensRow): void => {
    if (err) return callback(err);
    if (!tokensRow) return callback(new Error(`market and outcome not found for shareToken ${log.shareToken} (${log.transactionHash}`));
    const queryData = {
      marketId: tokensRow.marketId!,
      outcome: tokensRow.outcome!,
      orderType: log.orderType === "0" ? "buy" : "sell",
    };
    db.from("orders").first(db.raw("MAX(blockNumber * ?? + logIndex) as maxLog", [MAX_LOGS_PER_BLOCK])).where(queryData).asCallback((err: Error|null, result: {maxLog: number}): void => {
      if (err) return callback(err);
      db.from("orders").where(db.raw("(blockNumber * ?? + logIndex) == ??", [MAX_LOGS_PER_BLOCK, result.maxLog])).update({orphaned: false}).asCallback((err) => {
        if (err) return callback(err);
        return callback(null);
      });
    });
  });
}

import * as t from "io-ts";
import * as Knex from "knex";
import { SortLimitParams, Address } from "../../types";

export const GetAccountTransactionHistoryParams = t.intersection([
  SortLimitParams,
  t.type({
    universe: t.string,
    account: t.string,
  }),
]);
type GetAccountTransactionHistoryParamsType = t.TypeOf<typeof GetAccountTransactionHistoryParams>;

function queryOrders(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  return qb.from("orders")
    .select(db.raw("? as action", "Order Created"), "orders.orderCreator as account", "tokens.marketId", "orders.transactionHash", db.raw("? as cost_basis", "0"), "orders.originalFullPrecisionAmount as amount")
    .join("tokens", "orders.shareToken", "tokens.contractAddress")
    .where({
      "orders.orderCreator": account,
    });
}

function queryOrdersCanceled(db: Knex, qb: Knex.QueryBuilder, account: Address, sortLimit: t.TypeOf<typeof SortLimitParams>) {
  return qb.from("orders_canceled")
    .select(db.raw("?", "Order Canceled"), "orders.orderCreator as account", "tokens.marketId", "orders_canceled.transactionHash", db.raw("? as cost_basis", "0"), db.raw("? as amount", "0"))
    .join("orders", "orders_canceled.orderId", "orders.orderId")
    .join("tokens", "orders.shareToken", "tokens.contractAddress");
}

export async function getAccountTransactionHistory(db: Knex, augur: {}, params: GetAccountTransactionHistoryParamsType) {
  return await db.select("data.*", "markets.shortDescription", "blocks.timestamp").from((qb: Knex.QueryBuilder) => {
    queryOrders(db, qb, params.account, params).union((qb: Knex.QueryBuilder) => {
      queryOrdersCanceled(db, qb, params.account, params);
    }).as("data");
  }).join("transactionHashes", "transactionHashes.transactionHash", "data.transactionHash")
    .join("blocks", "transactionHashes.blockNumber", "blocks.blockNumber")
    .join("markets", "markets.marketId", "data.marketId")
    .orderBy("blocks.timestamp", "desc");
}

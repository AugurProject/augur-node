import { Augur } from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Address, FormattedEventLog, MarketsRow, OrdersRow, TokensRow, TradesRow } from "../../../types";
import { updateOrder } from "./update-order";
import { updateVolumetrics } from "./update-volumetrics";
import { augurEmitter } from "../../../events";
import { formatBigNumberAsFixed } from "../../../utils/format-big-number-as-fixed";
import { fixedPointToDecimal, numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { BN_WEI_PER_ETHER, SubscriptionEventNames } from "../../../constants";
import { updateOutcomeValueFromOrders, removeOutcomeValue } from "../profit-loss/update-outcome-value";
import { updateProfitLoss, updateProfitLossRemoveRow } from "../profit-loss/update-profit-loss";
import { updateSpreadPercentForMarketAndOutcomes } from "../../../utils/liquidity";

interface TokensRowWithNumTicksAndCategory extends TokensRow {
  category: string;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  numTicks: BigNumber;
}

export async function processOrderFilledLog(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const shareToken: Address = log.shareToken;
    const blockNumber: number = log.blockNumber;
    const filler: Address = log.filler;
    const tokensRow: TokensRow|undefined = await db.first("marketId", "outcome").from("tokens").where({ contractAddress: shareToken });

    if (!tokensRow) throw new Error(`market and outcome not found for shareToken: ${shareToken} (${log.transactionHash})`);
    const marketId = tokensRow.marketId;
    const outcome = tokensRow.outcome!;
    const marketsRow: MarketsRow<BigNumber>|undefined = await db.first("minPrice", "maxPrice", "numTicks", "category", "finalizationBlockNumber").from("markets").where({ marketId });

    if (!marketsRow) throw new Error(`market not found: ${marketId}`);
    const minPrice = marketsRow.minPrice;
    const maxPrice = marketsRow.maxPrice;
    const numTicks = marketsRow.numTicks;
    const category = marketsRow.category;
    const finalized = marketsRow.finalizationBlockNumber !== null;
    const orderId = log.orderId;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const ordersRow: OrdersRow<BigNumber>|undefined = await db.first("orderCreator", "fullPrecisionPrice", "orderType").from("orders").where({ orderId });

    if (!ordersRow) throw new Error(`order not found, orderId: ${orderId} (${log.transactionHash})`);
    const orderCreator = ordersRow.orderCreator;
    const price = ordersRow.fullPrecisionPrice;
    const orderType = ordersRow.orderType;
    const amount = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.amountFilled, 10), tickSize);
    const numCreatorTokens = fixedPointToDecimal(new BigNumber(log.numCreatorTokens, 10), BN_WEI_PER_ETHER);
    const numCreatorShares = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.numCreatorShares, 10), tickSize);
    const numFillerTokens = fixedPointToDecimal(new BigNumber(log.numFillerTokens, 10), BN_WEI_PER_ETHER);
    const numFillerShares = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.numFillerShares, 10), tickSize);
    const marketCreatorFees = fixedPointToDecimal(new BigNumber(log.marketCreatorFees, 10), BN_WEI_PER_ETHER);
    const reporterFees = fixedPointToDecimal(new BigNumber(log.reporterFees, 10), BN_WEI_PER_ETHER);
    const tradesRowBigNumber: TradesRow<BigNumber> = {
      marketId,
      outcome,
      orderId,
      creator: orderCreator,
      orderType,
      filler,
      shareToken,
      blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      tradeGroupId: log.tradeGroupId,
      numCreatorTokens,
      numCreatorShares,
      numFillerTokens,
      numFillerShares,
      price,
      amount,
      marketCreatorFees,
      reporterFees,
    };
    const tradesRowString = formatBigNumberAsFixed<TradesRow<BigNumber>, TradesRow<string>>(tradesRowBigNumber);
    augurEmitter.emit(SubscriptionEventNames.OrderFilled, Object.assign({}, log, tradesRowString));
    await db.insert(tradesRowString).into("trades");

    await updateVolumetrics(db, augur, category, marketId, outcome, blockNumber, orderId, orderCreator, tickSize, minPrice, maxPrice, true);

    await updateOrder(db, augur, marketId, orderId, amount, price, numCreatorShares, numCreatorTokens);

    if (!finalized) {
      await updateOutcomeValueFromOrders(db, marketId, outcome, log.transactionHash, log.blockNumber, log.logIndex, price);
    }

    await updateProfitLoss(db, marketId, orderType === "buy" ? amount : amount.negated(), orderCreator, outcome, price, log.transactionHash, log.blockNumber, log.logIndex, tradesRowBigNumber);
    await updateProfitLoss(db, marketId, orderType === "sell" ? amount : amount.negated(), filler, outcome, price, log.transactionHash, log.blockNumber, log.logIndex, tradesRowBigNumber);

    await updateSpreadPercentForMarketAndOutcomes(db, marketId);
  };
}

export async function processOrderFilledLogRemoval(augur: Augur, log: FormattedEventLog) {
  return async (db: Knex) => {
    const shareToken: Address = log.shareToken;
    const blockNumber: number = log.blockNumber;
    const tokensRow: TokensRowWithNumTicksAndCategory|undefined = await db.first("tokens.marketId", "tokens.outcome", "markets.numTicks", "markets.category", "markets.minPrice", "markets.maxPrice").from("tokens").join("markets", "tokens.marketId", "markets.marketId").where("tokens.contractAddress", shareToken);

    if (!tokensRow) throw new Error(`market and outcome not found for ShareToken: ${shareToken} (${log.transactionHash})`);
    const marketId = tokensRow.marketId;
    const outcome = tokensRow.outcome!;
    const numTicks = tokensRow.numTicks;
    const minPrice = tokensRow.minPrice;
    const maxPrice = tokensRow.maxPrice;
    const category = tokensRow.category;
    const orderId = log.orderId;
    const ordersRow: OrdersRow<BigNumber>|undefined = await db.first("orderCreator", "fullPrecisionPrice", "orderType").from("orders").where({ orderId });

    if (!ordersRow) throw new Error(`order not found, orderId: ${orderId} (${log.transactionHash}`);
    const orderCreator = ordersRow.orderCreator;
    const price = ordersRow.fullPrecisionPrice;
    const orderType = ordersRow.orderType;
    const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
    const numCreatorTokens = fixedPointToDecimal(new BigNumber(log.numCreatorTokens), BN_WEI_PER_ETHER);
    const numCreatorShares = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.numCreatorShares, 10), new BigNumber(tickSize, 10));
    const numFillerTokens = fixedPointToDecimal(new BigNumber(log.numFillerTokens), BN_WEI_PER_ETHER);
    const numFillerShares = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.numFillerShares, 10), new BigNumber(tickSize, 10));
    const marketCreatorFees = fixedPointToDecimal(new BigNumber(log.marketCreatorFees), BN_WEI_PER_ETHER);
    const reporterFees = fixedPointToDecimal(new BigNumber(log.reporterFees), BN_WEI_PER_ETHER);
    const amount = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(log.amountFilled, 10), tickSize);

    await updateVolumetrics(db, augur, category, marketId, outcome, blockNumber, orderId, orderCreator, tickSize, minPrice, maxPrice, false);
    await db.from("trades").where({ marketId, outcome, orderId, blockNumber }).del();
    await updateOrder(db, augur, marketId, orderId, amount.negated(), price, numCreatorShares.negated(), numCreatorTokens.negated());
    augurEmitter.emit(SubscriptionEventNames.OrderFilled, Object.assign({}, log, {
      marketId,
      outcome,
      creator: orderCreator,
      orderType,
      numCreatorTokens,
      numCreatorShares,
      numFillerTokens,
      numFillerShares,
      price,
      amount,
      marketCreatorFees,
      reporterFees,
    }));
    await removeOutcomeValue(db, log.transactionHash);
    await updateProfitLossRemoveRow(db, log.transactionHash);
    await updateSpreadPercentForMarketAndOutcomes(db, marketId);
  };
}

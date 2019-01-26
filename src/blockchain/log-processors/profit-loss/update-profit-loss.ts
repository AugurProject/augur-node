import * as Knex from "knex";
import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import { Address} from "../../../types";
import { numTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { QueryBuilder } from "knex";
import { getCurrentTime } from "../../process-block";
import { ZERO } from "../../../constants";

interface UpdateData {
  account: Address;
  numOwned: BigNumber;
  moneySpent: BigNumber;
  profit: BigNumber;
  transactionHash: string;
  outcome: BigNumber;
  numEscrowed: BigNumber;
}

interface OutcomeMoneySpent {
  moneySpent: BigNumber;
  outcome: BigNumber;
}

interface OutcomeNumEscrowed {
  numEscrowed: BigNumber;
  outcome: BigNumber;
}

interface ShareData {
  marketId: Address;
  outcome: BigNumber;
}

interface MarketData {
  numTicks: BigNumber;
  maxPrice: BigNumber;
  minPrice: BigNumber;
}

export function getBlockTransactionIndex(blockNumber: number, transactionIndex: number): number {
  return blockNumber * 1000000 + transactionIndex;
}

export async function updateProfitLossBuyShares(db: Knex, marketId: Address, account: Address, tokensSpent: BigNumber, outcomes: Array<number>, transactionHash: string): Promise<void> {
  const tokensSpentPerOutcome = tokensSpent.dividedBy(outcomes.length);
  const moneySpentRows: Array<OutcomeMoneySpent> = await db
    .select(["outcome", "moneySpent"])
    .from("profit_loss_timeseries")
    .where({ account, transactionHash, marketId })
    .whereIn("outcome", outcomes)
    .orderBy("blockTransactionIndex", "DESC");
  for (const moneySpentRow of moneySpentRows) {
    const newMoneySpent = tokensSpentPerOutcome.plus(moneySpentRow.moneySpent || ZERO).toString();
    await db("profit_loss_timeseries")
      .update({ moneySpent: newMoneySpent })
      .where({ account, transactionHash, marketId, outcome: moneySpentRow.outcome });
  }
}

async function updateProfit(db: Knex, marketId: Address, account: Address, outcome: number, transactionHash: string, totalProfit: BigNumber, blockTransactionIndex: number): Promise<void> {
  const timestamp = getCurrentTime();
  const updateData: UpdateData | undefined = await db
    .first(["account", "numOwned", "moneySpent", "profit", "transactionHash", "outcome", "numEscrowed"])
    .from("profit_loss_timeseries")
    .where({ account, marketId, outcome })
    .orderBy("blockTransactionIndex", "DESC");
  let upsertEntry: QueryBuilder;
  const profit = totalProfit.plus(updateData ? updateData.profit : ZERO).toString();
  const insertData = {
    marketId,
    account,
    outcome,
    transactionHash,
    timestamp,
    blockTransactionIndex,
    numOwned: "0",
    numEscrowed: "0",
    moneySpent: "0",
    profit,
  };
  if (!updateData) {
    // No entries for this user for this outcome
    upsertEntry = db.insert(insertData).into("profit_loss_timeseries");
  } else if (updateData.transactionHash === transactionHash) {
    // Previous entry was from the same transaction. Just update the profit for it
    upsertEntry = db
      .from("profit_loss_timeseries")
      .where({ account, transactionHash, marketId, outcome })
      .update({ profit });
  } else {
    // New tx for this account and outcome. Make a new row with previous row's data
    if (updateData.moneySpent) insertData.moneySpent = updateData.moneySpent.toString();
    if (updateData.numOwned) insertData.numOwned = updateData.numOwned.toString();
    if (updateData.numEscrowed) insertData.numEscrowed = updateData.numEscrowed.toString();
    upsertEntry = db.insert(insertData).into("profit_loss_timeseries");
  }
  await upsertEntry;
}

export async function updateProfitLossSellEscrowedShares(db: Knex, marketId: Address, numShares: BigNumber, account: Address, outcomes: Array<number>, tokensReceived: BigNumber, transactionHash: string, blockNumber: number, transactionIndex: number, profitOutcome: number): Promise<void> {
  const tokensReceivedPerOutcome = tokensReceived.dividedBy(outcomes.length);
  const timestamp = getCurrentTime();
  const blockTransactionIndex = getBlockTransactionIndex(blockNumber, transactionIndex);

  let totalProfit = ZERO;

  for (const outcome of outcomes) {
    const updateData: UpdateData = await db
      .first(["account", "numOwned", "moneySpent", "profit", "transactionHash", "outcome", "numEscrowed"])
      .from("profit_loss_timeseries")
      .where({ account, marketId, outcome })
      .orderBy("blockTransactionIndex", "DESC");

    const sellPrice = tokensReceivedPerOutcome.dividedBy(numShares);
    const numOwned = updateData.numOwned || ZERO;
    const oldMoneySpent = updateData.moneySpent || ZERO;
    const oldProfit = updateData.profit || ZERO;
    const originalNumEscrowed = updateData.numEscrowed || ZERO;
    const originalNumOwned = numShares.plus(numOwned);
    const originalTotalOwned = originalNumOwned.plus(originalNumEscrowed);
    const newNumEscrowed = originalNumEscrowed.minus(numShares);
    const newTotalOwned = numOwned.plus(newNumEscrowed);
    const moneySpent = oldMoneySpent.multipliedBy(newTotalOwned.dividedBy(originalTotalOwned)).toString();
    totalProfit = totalProfit.plus(numShares.multipliedBy(sellPrice.minus(oldMoneySpent.dividedBy(originalTotalOwned))));
    const insertData = {
      marketId,
      account,
      outcome: updateData.outcome,
      transactionHash,
      timestamp,
      blockTransactionIndex,
      numOwned: numOwned.toString(),
      numEscrowed: newNumEscrowed.toString(),
      moneySpent,
      profit: oldProfit.toString(),
    };
    let upsertEntry: QueryBuilder;
    if (updateData.transactionHash !== transactionHash) {
      upsertEntry = db.insert(insertData).into("profit_loss_timeseries");
    } else {
      upsertEntry = db("profit_loss_timeseries")
        .update({ moneySpent, profit: oldProfit.toString() })
        .where({ account, transactionHash, marketId, outcome: updateData.outcome });
    }
    await upsertEntry;
  }

  if (!totalProfit.eq(ZERO)) {
    await updateProfit(db, marketId, account, profitOutcome, transactionHash, totalProfit, blockTransactionIndex);
  }
}

export async function updateProfitLossSellShares(db: Knex, marketId: Address, numShares: BigNumber, account: Address, outcomes: Array<number>, tokensReceived: BigNumber, transactionHash: string, blockNumber: number, transactionIndex: number, profitOutcome: number|null): Promise<void> {
  const tokensReceivedPerOutcome = tokensReceived.dividedBy(outcomes.length);
  const updateDataRows: Array<UpdateData> = await db
    .select(["account", "numOwned", "moneySpent", "profit", "transactionHash", "outcome", "numEscrowed"])
    .from("profit_loss_timeseries")
    .where({ account, marketId, transactionHash })
    .whereIn("outcome", outcomes);

  let totalProfit = ZERO;

  for (const updateData of updateDataRows) {
    const sellPrice = tokensReceivedPerOutcome.dividedBy(numShares);
    const numOwned = new BigNumber(updateData.numOwned || 0);
    const oldMoneySpent = new BigNumber(updateData.moneySpent || 0);
    const oldProfit = new BigNumber(updateData.profit || 0);
    const numEscrowed = new BigNumber(updateData.numEscrowed || 0);
    const originalNumOwned = numShares.plus(numOwned);
    const totalOwned = originalNumOwned.plus(numEscrowed);
    let newProfit = oldProfit;
    // In the case of complete sets each outcome profits instead of it being based on an order outcome
    if (profitOutcome !== null) {
      totalProfit = totalProfit.plus(numShares.multipliedBy(sellPrice.minus(oldMoneySpent.dividedBy(totalOwned))));
    } else {
      newProfit = oldProfit.plus(numShares.multipliedBy(sellPrice.minus(oldMoneySpent.dividedBy(totalOwned))));
    }
    const moneySpent = oldMoneySpent.multipliedBy(numOwned.dividedBy(totalOwned)).toString();
    await db("profit_loss_timeseries")
      .update({ moneySpent, profit: newProfit.toString() })
      .where({ account, transactionHash, marketId, outcome: updateData.outcome });
  }

  if (profitOutcome !== null && !totalProfit.eq(ZERO)) {
    const blockTransactionIndex = getBlockTransactionIndex(blockNumber, transactionIndex);
    await updateProfit(db, marketId, account, profitOutcome, transactionHash, totalProfit, blockTransactionIndex);
  }
}

export async function updateProfitLossChangeShareBalance(db: Knex, augur: Augur, token: Address, numShares: BigNumber, account: Address, transactionHash: string, blockNumber: number, transactionIndex: number): Promise<void> {
  // Don't record FillOrder
  if (account === augur.contracts.addresses[augur.rpc.getNetworkID()].FillOrder) return;
  const timestamp = getCurrentTime();
  const blockTransactionIndex = getBlockTransactionIndex(blockNumber, transactionIndex);
  const shareData: ShareData = await db
    .first(["marketId", "outcome"])
    .from("tokens")
    .where({ contractAddress: token });
  const marketId = shareData.marketId;
  const outcome = shareData.outcome;
  // Don't record market transfers
  if (account === marketId) return;

  const updateData: UpdateData | undefined = await db
    .first(["account", "numOwned", "moneySpent", "profit", "transactionHash", "outcome", "numEscrowed"])
    .from("profit_loss_timeseries")
    .where({ account, marketId, outcome })
    .orderBy("blockTransactionIndex", "DESC");
  const marketData: MarketData = await db
    .first(["numTicks", "minPrice", "maxPrice"])
    .from("markets")
    .where({ marketId });
  const minPrice = marketData.minPrice;
  const maxPrice = marketData.maxPrice;
  const numTicks = marketData.numTicks;
  const tickSize = numTicksToTickSize(numTicks, minPrice, maxPrice);
  const numOwned = numShares
    .dividedBy(tickSize)
    .dividedBy(10 ** 18)
    .toString();
  let upsertEntry: QueryBuilder;
  const insertData = {
    marketId,
    account,
    outcome,
    transactionHash,
    timestamp,
    blockTransactionIndex,
    numOwned,
    numEscrowed: "0",
    moneySpent: "0",
    profit: "0",
  };
  if (!updateData) {
    // No entries for this user for this outcome
    upsertEntry = db.insert(insertData).into("profit_loss_timeseries");
  } else if (updateData.transactionHash === transactionHash) {
    // Previous entry was from the same transaction. Just update the balance for it
    upsertEntry = db
      .from("profit_loss_timeseries")
      .where({ account, transactionHash, marketId, outcome })
      .update({ numOwned });
  } else {
    // New tx for this account and outcome. Make a new row with previous row's data
    if (updateData.moneySpent) insertData.moneySpent = updateData.moneySpent.toString();
    if (updateData.profit) insertData.profit = updateData.profit.toString();
    if (updateData.numEscrowed) insertData.numEscrowed = updateData.numEscrowed.toString();
    upsertEntry = db.insert(insertData).into("profit_loss_timeseries");
  }
  await upsertEntry;
}

// We only need to call this for the share balance update since the tx hash of the removed block will be shared between the price updates and the share balance update
export async function updateProfitLossRemoveRow(db: Knex, transactionHash: string): Promise<void> {
  // if this tx was rollbacked simply delete any rows correlated with it
  await db("profit_loss_timeseries")
    .delete()
    .where({ transactionHash });
}

export async function updateProfitLossNumEscrowed(db: Knex, marketId: Address, numEscrowedDelta: BigNumber, account: Address, outcomes: Array<number>, transactionHash: string): Promise<void> {
  const numEscrowedRows: Array<OutcomeNumEscrowed> = await db
    .select(["outcome", "numEscrowed"])
    .from("profit_loss_timeseries")
    .where({ account, transactionHash, marketId })
    .whereIn("outcome", outcomes)
    .orderBy("blockTransactionIndex", "DESC");
  for (const numEscrowedRow of numEscrowedRows) {
    const newNumEscrowed = new BigNumber(numEscrowedDelta).plus(numEscrowedRow.numEscrowed || 0).toString();
    await db("profit_loss_timeseries")
      .update({ numEscrowed: newNumEscrowed })
      .where({ account, transactionHash, marketId, outcome: numEscrowedRow.outcome });
  }
}

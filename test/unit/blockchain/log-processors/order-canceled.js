const { setupTestDb, seedDb } = require("test.database");
const { BigNumber } = require("bignumber.js");
const { processOrderCanceledLog, processOrderCanceledLogRemoval } = require("src/blockchain/log-processors/order-canceled");

async function getState(db, log) {
  return {
    order: await db("orders").where("orderId", log.orderId).first(),
    orderCanceled: await db("orders_canceled").where("orderId", log.orderId).first(),
  };
}

describe("blockchain/log-processors/order-canceled", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  const log = {
    universe: "0x000000000000000000000000000000000000000b",
    shareToken: "0x0100000000000000000000000000000000000000",
    sender: "0x0000000000000000000000000000000000000b0b",
    orderId: "0x1000000000000000000000000000000000000000000000000000000000000000",
    sharesRefund: "0",
    tokensRefund: "1125000000000000000",
    blockNumber: 1400101,
    transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
    logIndex: 0,
  };
  test("OrderCanceled log and removal", async () => {
    return db.transaction(async (trx) => {
      await(await processOrderCanceledLog({}, log))(trx);
      const latestProfitLoss = await trx
        .first()
        .from("wcl_profit_loss_timeseries")
        .where({ account: "0x0000000000000000000000000000000000000b0b", marketId: "0x0000000000000000000000000000000000000001", outcome: 0, transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00" })
        .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
      expect(latestProfitLoss).toEqual({
        timestamp: 0,
        account: "0x0000000000000000000000000000000000000b0b",
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
        // these are non-sensical values just used to ensure data is copied over correctly from previous profitLoss:
        price: new BigNumber(7),
        position: new BigNumber(8),
        quantityOpened: new BigNumber(-5),
        profit: new BigNumber(12),
        realizedCost: new BigNumber(32),
        frozenFunds: new BigNumber(0.9),
        blockNumber: 1400101,
        logIndex: 0,
      });
      await expect(getState(trx, log)).resolves.toEqual({
        order: {
          orderId: "0x1000000000000000000000000000000000000000000000000000000000000000",
          blockNumber: 1400001,
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000A00",
          logIndex: 0,
          marketId: "0x0000000000000000000000000000000000000001",
          outcome: 0,
          shareToken: "0x0100000000000000000000000000000000000000",
          orderType: "buy",
          orderCreator: "0x0000000000000000000000000000000000000b0b",
          orderState: "CANCELED",
          fullPrecisionPrice: new BigNumber("0.7", 10),
          fullPrecisionAmount: new BigNumber("1", 10),
          originalFullPrecisionAmount: new BigNumber("1", 10),
          price: new BigNumber("0.7", 10),
          amount: new BigNumber("1", 10),
          originalAmount: new BigNumber("1", 10),
          originalSharesEscrowed: new BigNumber("0", 10),
          originalTokensEscrowed: new BigNumber("0.7", 10),
          tokensEscrowed: new BigNumber("0.7", 10),
          sharesEscrowed: new BigNumber("0", 10),
          tradeGroupId: null,
          orphaned: 0,
        },
        orderCanceled: {
          blockNumber: 1400101,
          logIndex: 0,
          orderId: "0x1000000000000000000000000000000000000000000000000000000000000000",
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
        },
      });
      await(await processOrderCanceledLogRemoval({}, log))(trx);
      const latestProfitLossRemoved = await trx
        .first()
        .from("wcl_profit_loss_timeseries")
        .where({ account: "0x0000000000000000000000000000000000000b0b", marketId: "0x0000000000000000000000000000000000000001", outcome: 0, transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00" })
        .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
      expect(latestProfitLossRemoved).toEqual(undefined);
      await expect(getState(trx, log)).resolves.toEqual({
        order: {
          orderId: "0x1000000000000000000000000000000000000000000000000000000000000000",
          blockNumber: 1400001,
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000A00",
          logIndex: 0,
          marketId: "0x0000000000000000000000000000000000000001",
          outcome: 0,
          shareToken: "0x0100000000000000000000000000000000000000",
          orderType: "buy",
          orderCreator: "0x0000000000000000000000000000000000000b0b",
          orderState: "OPEN",
          fullPrecisionPrice: new BigNumber("0.7", 10),
          fullPrecisionAmount: new BigNumber("1", 10),
          originalFullPrecisionAmount: new BigNumber("1", 10),
          price: new BigNumber("0.7", 10),
          amount: new BigNumber("1", 10),
          originalAmount: new BigNumber("1", 10),
          originalTokensEscrowed: new BigNumber("0.7", 10),
          originalSharesEscrowed: new BigNumber("0", 10),
          tokensEscrowed: new BigNumber("0.7", 10),
          sharesEscrowed: new BigNumber("0", 10),
          tradeGroupId: null,
          orphaned: 0,
        },
      });
    });
  });

  afterEach(async () => {
    await db.destroy();
  });
});

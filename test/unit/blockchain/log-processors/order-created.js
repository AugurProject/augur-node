const { fix } = require("speedomatic");
const { setupTestDb, seedDb, makeMockAugur } = require("test.database");
const { BigNumber } = require("bignumber.js");
const { processOrderCreatedLog, processOrderCreatedLogRemoval } = require("src/blockchain/log-processors/order-created");

function getState(db, log) {
  return db("orders").where("orderId", log.orderId);
}

const augur = makeMockAugur({
  api: {
    OrdersFinder: {
      getExistingOrders5: () => Promise.resolve(["ORDER_ID"]),
    },
  },
});

function getPendingOrphansState(db, marketId) {
  return db("pending_orphan_checks").where("marketId", marketId);
}


describe("blockchain/log-processors/order-created", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  const log = {
    orderType: "0",
    shareToken: "0x0100000000000000000000000000000000000000",
    price: "7500",
    amount: augur.utils.convertDisplayAmountToOnChainAmount("3", new BigNumber(1), new BigNumber(10000)).toString(),
    sharesEscrowed: "0",
    moneyEscrowed: fix("2.25", "string"),
    creator: "CREATOR_ADDRESS",
    orderId: "ORDER_ID",
    tradeGroupId: "TRADE_GROUP_ID",
    blockNumber: 1400100,
    transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
    logIndex: 0,
  };
  test("OrderCreated log and removal with default wcl_profit_loss_timeseries", async () => {
    await db.transaction(async (trx) => {
      await(await processOrderCreatedLog(augur, log))(trx);
      const latestProfitLoss = await trx
        .first()
        .from("wcl_profit_loss_timeseries")
        .where({ account: "CREATOR_ADDRESS", marketId: "0x0000000000000000000000000000000000000001", outcome: 0, transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00" })
        .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
      expect(latestProfitLoss).toEqual({
        timestamp: 0,
        account: "CREATOR_ADDRESS",
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
        price: new BigNumber(0),
        position: new BigNumber(0),
        quantityOpened: new BigNumber(0),
        profit: new BigNumber(0),
        realizedCost: new BigNumber(0),
        frozenFunds: new BigNumber(2.25),
        blockNumber: 1400100,
        logIndex: 0,
      });
      expect(await getState(trx, log)).toEqual([{
        orderId: "ORDER_ID",
        blockNumber: 1400100,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
        logIndex: 0,
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        shareToken: "0x0100000000000000000000000000000000000000",
        orderType: "buy",
        orderCreator: "CREATOR_ADDRESS",
        orderState: "OPEN",
        fullPrecisionPrice: new BigNumber("0.75", 10),
        fullPrecisionAmount: new BigNumber("3", 10),
        originalFullPrecisionAmount: new BigNumber("3", 10),
        price: new BigNumber("0.75", 10),
        amount: new BigNumber("3", 10),
        originalAmount: new BigNumber("3", 10),
        originalSharesEscrowed: new BigNumber("0", 10),
        originalTokensEscrowed: new BigNumber("2.25", 10),
        tokensEscrowed: new BigNumber("2.25", 10),
        sharesEscrowed: new BigNumber("0", 10),
        tradeGroupId: "TRADE_GROUP_ID",
        orphaned: 0,
      }]);
      expect(await getPendingOrphansState(trx, "0x0000000000000000000000000000000000000001")).toEqual([{
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        orderType: "buy",
      }]);
      await(await processOrderCreatedLogRemoval(augur, log))(trx);
      const latestProfitLossRemoved = await trx
        .first()
        .from("wcl_profit_loss_timeseries")
        .where({ account: "CREATOR_ADDRESS", marketId: "0x0000000000000000000000000000000000000001", outcome: 0, transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00" })
        .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
      expect(latestProfitLossRemoved).toEqual(undefined);
      expect(await getState(trx, log)).toEqual([]);
    });
  });
  test("OrderCreated with previously existing wcl_profit_loss_timeseries", async () => {
    await db.transaction(async (trx) => {
      await trx.insert({
        timestamp: 0,
        account: "CREATOR_ADDRESS",
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000001337",
        price: "1",
        position: "2.5",
        quantityOpened: "3",
        profit: "4",
        realizedCost: "5",
        frozenFunds: "1.42",
        blockNumber: 13371,
        logIndex: 6,
      }).into("wcl_profit_loss_timeseries");
      await(await processOrderCreatedLog(augur, log))(trx);
      const latestProfitLoss = await trx
        .first()
        .from("wcl_profit_loss_timeseries")
        .where({ account: "CREATOR_ADDRESS", marketId: "0x0000000000000000000000000000000000000001", outcome: 0, transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00" })
        .orderByRaw(`"blockNumber" DESC, "logIndex" DESC, "rowid" DESC`);
      expect(latestProfitLoss).toEqual({
        timestamp: 0,
        account: "CREATOR_ADDRESS",
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
        price: new BigNumber(1),
        position: new BigNumber(2.5),
        quantityOpened: new BigNumber(3),
        profit: new BigNumber(4),
        realizedCost: new BigNumber(5),
        frozenFunds: new BigNumber(3.67),
        blockNumber: 1400100,
        logIndex: 0,
      });
    });
  });

  afterEach(async () => {
    await db.destroy();
  });
});

const setupTestDb = require("../../test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");

describe("server/getters/get-trading-history", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    await db.destroy();
  });

  const runTest = (t) => {
    test(t.description, async () => {
      t.method = "getTradingHistory";
      const userTradingHistory = await dispatchJsonRpcRequest(db, t, null);
      t.assertions(userTradingHistory);
    });
  };
  runTest({
    description: "user was filler in 1 trade in market and outcome",
    params: {
      universe: null,
      account: "0x000000000000000000000000000000000000d00d",
      marketId: "0x0000000000000000000000000000000000000001",
      outcome: 0,
      orderType: null,
      sortBy: "price",
      isSortDescending: null,
      limit: null,
      offset: null,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([{
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C00",
        logIndex: 0,
        orderId: "0x1100000000000000000000000000000000000000000000000000000000000000",
        type: "buy",
        price: "5.5",
        amount: "0.2",
        maker: false,
        marketCreatorFees: "0",
        reporterFees: "0",
        selfFilled: false,
        settlementFees: "0",
        marketId: "0x0000000000000000000000000000000000000001",
        outcome: 0,
        shareToken: "0x0100000000000000000000000000000000000000",
        timestamp: 1506474500,
        tradeGroupId: null,
      }, {
        amount: "2",
        logIndex: 0,
        maker: false,
        marketCreatorFees: "0",
        marketId: "0x0000000000000000000000000000000000000001",
        orderId: "0x1990000000000000000000000000000000000000000000000000000000000000",
        outcome: 0,
        price: "4.2",
        reporterFees: "0",
        selfFilled: false,
        settlementFees: "0",
        shareToken: "0x0100000000000000000000000000000000000000",
        timestamp: 1509065474,
        tradeGroupId: null,
        transactionHash: "0x00000000000000000000000000000000000000000000000000000000d3adb33f",
        type: "sell",
      }]);
    },
  });
  runTest({
    description: "user was creator in many markets and outcomes",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      marketId: null,
      outcome: 0,
      orderType: null,
      sortBy: "timestamp",
      isSortDescending: true,
      limit: null,
      offset: null,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([
        {
          amount: "0.1",
          logIndex: 0,
          maker: true,
          marketCreatorFees: "0",
          marketId: "0x0000000000000000000000000000000000000011",
          orderId: "0x7000000000000000000000000000000000000000000000000000000000000000",
          outcome: 0,
          price: "4.2",
          reporterFees: "0",
          selfFilled: true,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1509065474,
          tradeGroupId: null,
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C09",
          type: "sell",
        }, {
          amount: "2",
          logIndex: 0,
          maker: true,
          marketCreatorFees: "0",
          marketId: "0x0000000000000000000000000000000000000001",
          orderId: "0x1990000000000000000000000000000000000000000000000000000000000000",
          outcome: 0,
          price: "4.2",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1509065474,
          tradeGroupId: null,
          transactionHash: "0x00000000000000000000000000000000000000000000000000000000d3adb33f",
          type: "sell",
        }, {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C04",
          logIndex: 0,
          orderId: "0x1500000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000012",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474515,
          tradeGroupId: null,
          type: "buy",
        },
        {
          amount: "0.1",
          logIndex: 0,
          orderId: "0x1900000000000000000000000000000000000000000000000000000000000000",
          maker: false,
          marketCreatorFees: "0",
          marketId: "0x0000000000000000000000000000000000000015",
          outcome: 0,
          price: "4.2",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474515,
          tradeGroupId: null,
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C08",
          type: "sell",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C00",
          logIndex: 0,
          orderId: "0x1100000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000001",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C01",
          logIndex: 0,
          orderId: "0x1200000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000002",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C02",
          logIndex: 0,
          orderId: "0x1300000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000003",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C03",
          logIndex: 0,
          orderId: "0x1400000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000011",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C05",
          logIndex: 0,
          orderId: "0x1600000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000013",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C06",
          logIndex: 0,
          orderId: "0x1700000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000014",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "sell",
        },
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C07",
          logIndex: 0,
          orderId: "0x1800000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000015",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "sell",
        },
      ]);
    },
  });
  runTest({
    description: "user was creator in many markets and outcomes, filter to one market",
    params: {
      universe: null,
      account: "0x0000000000000000000000000000000000000b0b",
      marketId: "0x0000000000000000000000000000000000000001",
      outcome: 0,
      orderType: null,
      sortBy: "amount",
      isSortDescending: false,
      limit: null,
      offset: null,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C00",
          logIndex: 0,
          orderId: "0x1100000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000001",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474500,
          tradeGroupId: null,
          type: "buy",
        }, {
          amount: "2",
          logIndex: 0,
          maker: true,
          marketCreatorFees: "0",
          marketId: "0x0000000000000000000000000000000000000001",
          orderId: "0x1990000000000000000000000000000000000000000000000000000000000000",
          outcome: 0,
          price: "4.2",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1509065474,
          tradeGroupId: null,
          transactionHash: "0x00000000000000000000000000000000000000000000000000000000d3adb33f",
          type: "sell",
        },
      ]);
    },
  });
  runTest({
    description: "user was creator in many markets and outcomes, filter by timestamp",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      marketId: null,
      outcome: 0,
      orderType: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
      earliestCreationTime: 1506474514,
      latestCreationTime: 1506474516,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C04",
          logIndex: 0,
          orderId: "0x1500000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: true,
          marketId: "0x0000000000000000000000000000000000000012",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474515,
          tradeGroupId: null,
          type: "buy",
        },
        {
          amount: "0.1",
          logIndex: 0,
          orderId: "0x1900000000000000000000000000000000000000000000000000000000000000",
          maker: false,
          marketCreatorFees: "0",
          marketId: "0x0000000000000000000000000000000000000015",
          outcome: 0,
          price: "4.2",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474515,
          tradeGroupId: null,
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C08",
          type: "sell",
        },
      ]);
    },
  });
  runTest({
    description: "lookup trades by market, not account, filter by timestamp",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      account: null,
      marketId: "0x0000000000000000000000000000000000000012",
      outcome: 0,
      orderType: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
      earliestCreationTime: 1506474514,
      latestCreationTime: 1506474516,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([
        {
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000C04",
          logIndex: 0,
          orderId: "0x1500000000000000000000000000000000000000000000000000000000000000",
          amount: "0.2",
          maker: null,
          marketId: "0x0000000000000000000000000000000000000012",
          outcome: 0,
          price: "5.5",
          marketCreatorFees: "0",
          reporterFees: "0",
          selfFilled: false,
          settlementFees: "0",
          shareToken: "0x0100000000000000000000000000000000000000",
          timestamp: 1506474515,
          tradeGroupId: null,
          type: "buy",
        },
      ]);
    },
  });
  runTest({
    description: "user has not performed any trades",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000bbb",
      marketId: null,
      outcome: null,
      orderType: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    },
    assertions: (userTradingHistory) => {
      expect(userTradingHistory).toEqual([]);
    },
  });
});

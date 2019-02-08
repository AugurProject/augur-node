jest.mock("src/blockchain/process-block");
const Augur = require("augur.js");
const { BigNumber } = require("bignumber.js");
const { setupTestDb, makeLogFactory } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const processBlock= require("src/blockchain/process-block");

describe("server/getters/get-user-trading-positions#Binary-1", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var yesShareToken = "0x0124000000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x0000000000000000000000000000000000000211";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000001b0b",
      amountFilled: new BigNumber(10).pow(15), // 10 shares
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000002b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(userTradingPositions[0].netPosition.toString()).toEqual("-7");
    expect(userTradingPositions[0].averagePrice.toString()).toEqual("0.65");
    expect(userTradingPositions[0].unrealized.toString()).toEqual("0.49");
    expect(userTradingPositions[0].realized.toString()).toEqual("0.21");
  });
});

describe("server/getters/get-user-trading-positions#Binary-2", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var yesShareToken = "0x0124000000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x0000000000000000000000000000000000000211";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000001b0b",
      amountFilled: new BigNumber(10).pow(15), // 10 shares
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000002b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000003b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(13),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000004b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000005b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(7),
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(userTradingPositions[0].averagePrice.toString()).toEqual("0.6305");
    expect(userTradingPositions[0].netPosition.toString()).toEqual("-3");
    expect(userTradingPositions[0].realized.toString()).toEqual("4.8785");
    expect(userTradingPositions[0].unrealized.toString()).toEqual("1.4415");
  });

  it("get the positions for an account which has no trades", async () => {
    const userTradingPositions = await getUserTradingPositions({
      account: "0x0000000000000000000000000000000000nobody",
      marketId: "0x0000000000000000000000000000000000000002",
      outcome: 1,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
      endTime: 1544804660,
    });

    expect(userTradingPositions).toEqual([]);
  });
});

describe("server/getters/get-user-trading-positions#Cat3-1", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var aShareToken = "0x0124A00000000000000000000000000000000000";
  var bShareToken = "0x0124B00000000000000000000000000000000000";
  var cShareToken = "0x0124C00000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x0000000000000000000000000000000000000442";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "SELL_A_0.4",
      amountFilled: new BigNumber(10).pow(14), // 1 share
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.2",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(2),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.3",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(0.5),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "BUY_A_0.7",
      amountFilled: new BigNumber(10).pow(14), // 1 share
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = userTradingPositions[0];
    const positionB = userTradingPositions[1];
    const positionC = userTradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("0");
    expect(positionA.averagePrice.toString()).toEqual("0");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("0.3");

    expect(positionB.netPosition.toString()).toEqual("-2");
    expect(positionB.averagePrice.toString()).toEqual("0.2");
    expect(positionB.unrealized.toString()).toEqual("0");
    expect(positionB.realized.toString()).toEqual("0");

    expect(positionC.netPosition.toString()).toEqual("0.5");
    expect(positionC.averagePrice.toString()).toEqual("0.3");
    expect(positionC.unrealized.toString()).toEqual("0");
    expect(positionC.realized.toString()).toEqual("0");
  });
});

describe("server/getters/get-user-trading-positions#Cat3-2", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var aShareToken = "0x0124A00000000000000000000000000000000000";
  var bShareToken = "0x0124B00000000000000000000000000000000000";
  var cShareToken = "0x0124C00000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x0000000000000000000000000000000000000442";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "BUY_A_0.4",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(5),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.35",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "BUY_C_0.3",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(8),
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = userTradingPositions[0];
    const positionB = userTradingPositions[1];
    const positionC = userTradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("-5");
    expect(positionA.averagePrice.toString()).toEqual("0.4");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("0");

    expect(positionB.netPosition.toString()).toEqual("-3");
    expect(positionB.averagePrice.toString()).toEqual("0.35");
    expect(positionB.unrealized.toString()).toEqual("0");
    expect(positionB.realized.toString()).toEqual("0");

    expect(positionC.netPosition.toString()).toEqual("-2");
    expect(positionC.averagePrice.toString()).toEqual("0.3");
    expect(positionC.unrealized.toString()).toEqual("0.4");
    expect(positionC.realized.toString()).toEqual("1.6");
  });
});

describe("server/getters/get-user-trading-positions#Cat3-3", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var aShareToken = "0x0124A00000000000000000000000000000000000";
  var bShareToken = "0x0124B00000000000000000000000000000000000";
  var cShareToken = "0x0124C00000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x0000000000000000000000000000000000000442";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "SELL_A_0.15",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "SELL_B_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(25),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.6",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(5),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.2",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(13),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "BUY_C_0.8",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "BUY_A_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = userTradingPositions[0];
    const positionB = userTradingPositions[1];
    const positionC = userTradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("0");
    expect(positionA.averagePrice.toString()).toEqual("0");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("-0.5");

    expect(positionB.netPosition.toString()).toEqual("12");
    expect(positionB.averagePrice.toString()).toEqual("0.1");
    expect(positionB.unrealized.toString()).toEqual("1.2");
    expect(positionB.realized.toString()).toEqual("1.3");

    expect(positionC.netPosition.toString()).toEqual("2");
    expect(positionC.averagePrice.toString()).toEqual("0.6");
    expect(positionC.unrealized.toString()).toEqual("0.4");
    expect(positionC.realized.toString()).toEqual("0.6");
  });
});

describe("server/getters/get-user-trading-positions#Scalar", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var longShareToken = "0x0124100000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x000000000000000000000000000000000000021c";

  var logs = [
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "SHORT_200",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(2),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "SHORT_180",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "LONG_202",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(4),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "LONG_205",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(11),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "SHORT_150",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(7),
    }),
  ];

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position", async () => {
    const userTradingPositions = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(userTradingPositions.length).toEqual(1);

    expect(userTradingPositions[0].netPosition.toString()).toEqual("-3");
    expect(userTradingPositions[0].averagePrice.toString()).toEqual("205");
    expect(userTradingPositions[0].unrealized.toString()).toEqual("165");
    expect(userTradingPositions[0].realized.toString()).toEqual("458");
  });
});

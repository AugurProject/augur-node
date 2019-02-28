jest.mock("src/blockchain/process-block");
const Augur = require("augur.js");
const { BigNumber } = require("bignumber.js");
const { setupTestDb, makeLogFactory } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const processBlock= require("src/blockchain/process-block");
const { BN_WEI_PER_ETHER, ZERO } = require("src/constants");

function bn(n) {
  return new BigNumber(n, 10);
}

function ethToWei(n /* BigNumber */) {
  return n.multipliedBy(BN_WEI_PER_ETHER);
}

const validityBondSumInEth = bn(12.3498); // sum of validityBondSize, converted from wei to eth, for seed markets created by the account used in these tests (account 0x0000000000000000000000000000000000b0b001); getUserTradingPositions returns a frozenFundsTotal which includes this value

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
      numFillerTokens: ethToWei(bn(3.5)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000002b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(3),
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(tradingPositions[0].netPosition.toString()).toEqual("-7");
    expect(tradingPositions[0].averagePrice.toString()).toEqual("0.65");
    expect(tradingPositions[0].unrealized.toString()).toEqual("0.49");
    expect(tradingPositions[0].realized.toString()).toEqual("0.21");
    expect(tradingPositions[0].frozenFunds.toString()).toEqual("2.45");

    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(2.45).plus(validityBondSumInEth).toString());
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
      numFillerTokens: ethToWei(bn(3.5)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000002b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000003b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(13),
      numFillerTokens: ethToWei(bn(4.94)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000004b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(10),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000005b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(7),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(7),
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(tradingPositions[0].averagePrice.toString()).toEqual("0.6305");
    expect(tradingPositions[0].netPosition.toString()).toEqual("-3");
    expect(tradingPositions[0].realized.toString()).toEqual("4.8785");
    expect(tradingPositions[0].unrealized.toString()).toEqual("1.4415");
    expect(tradingPositions[0].frozenFunds.toString()).toEqual("1.1085");

    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(1.1085).plus(validityBondSumInEth).toString());
  });

  it("get the positions for an account which has no trades", async () => {
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      account: "0x0000000000000000000000000000000000nobody",
      marketId: "0x0000000000000000000000000000000000000002",
      outcome: 1,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
      endTime: 1544804660,
    });

    expect(tradingPositions).toEqual([]);
    expect(frozenFundsTotal.frozenFunds.toString()).toEqual("0");
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
      numFillerTokens: ethToWei(bn(0.4)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.2",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(2),
      numFillerTokens: ethToWei(bn(1.6)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.3",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(0.5),
      numFillerTokens: ethToWei(bn(0.15)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "BUY_A_0.7",
      amountFilled: new BigNumber(10).pow(14), // 1 share
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14),
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = tradingPositions[0];
    const positionB = tradingPositions[1];
    const positionC = tradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("0");
    expect(positionA.averagePrice.toString()).toEqual("0");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("0.3");
    expect(positionA.frozenFunds.toString()).toEqual("0");

    expect(positionB.netPosition.toString()).toEqual("-2");
    expect(positionB.averagePrice.toString()).toEqual("0.2");
    expect(positionB.unrealized.toString()).toEqual("0");
    expect(positionB.realized.toString()).toEqual("0");
    expect(positionB.frozenFunds.toString()).toEqual("1.6");

    expect(positionC.netPosition.toString()).toEqual("0.5");
    expect(positionC.averagePrice.toString()).toEqual("0.3");
    expect(positionC.unrealized.toString()).toEqual("0");
    expect(positionC.realized.toString()).toEqual("0");
    expect(positionC.frozenFunds.toString()).toEqual("0.15");

    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(1.75).plus(validityBondSumInEth).toString());
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
      numFillerTokens: ethToWei(bn(3)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.35",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(3),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "BUY_C_0.3",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
      numFillerTokens: ethToWei(bn(3.5)),
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(5),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(8),
      numFillerTokens: ethToWei(bn(0.3)),
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(5),
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = tradingPositions[0];
    const positionB = tradingPositions[1];
    const positionC = tradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("-5");
    expect(positionA.averagePrice.toString()).toEqual("0.4");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("0");
    expect(positionA.frozenFunds.toString()).toEqual("3");

    expect(positionB.netPosition.toString()).toEqual("-3");
    expect(positionB.averagePrice.toString()).toEqual("0.35");
    expect(positionB.unrealized.toString()).toEqual("0");
    expect(positionB.realized.toString()).toEqual("0");
    expect(positionB.frozenFunds.toString()).toEqual("-1.05");

    expect(positionC.netPosition.toString()).toEqual("-2");
    expect(positionC.averagePrice.toString()).toEqual("0.3");
    expect(positionC.unrealized.toString()).toEqual("0.4");
    expect(positionC.realized.toString()).toEqual("1.6");
    expect(positionC.frozenFunds.toString()).toEqual("-0.6");

    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(1.35).plus(validityBondSumInEth).toString());
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
      numFillerTokens: ethToWei(bn(1.5)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "SELL_B_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(25),
      numFillerTokens: ethToWei(bn(2.5)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "SELL_C_0.6",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(5),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(5),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: bShareToken,
      filler: account,
      orderId: "BUY_B_0.2",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(13),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(13),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: cShareToken,
      filler: account,
      orderId: "BUY_C_0.8",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
      numFillerTokens: ethToWei(bn(0.6)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: aShareToken,
      filler: account,
      orderId: "BUY_A_0.1",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10),
      // TODO chwy - this is supposed to be "provide A 8, 1.8 tokens" afaict, but the test case only passes if it's "provide A 10"
      numFillerTokens: ZERO, //ethToWei(bn(1.8)),
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(10), // should be 8
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    const positionA = tradingPositions[0];
    const positionB = tradingPositions[1];
    const positionC = tradingPositions[2];

    expect(positionA.netPosition.toString()).toEqual("0");
    expect(positionA.averagePrice.toString()).toEqual("0");
    expect(positionA.unrealized.toString()).toEqual("0");
    expect(positionA.realized.toString()).toEqual("-0.5");
    expect(positionA.frozenFunds.toString()).toEqual("0");

    expect(positionB.netPosition.toString()).toEqual("12");
    expect(positionB.averagePrice.toString()).toEqual("0.1");
    expect(positionB.unrealized.toString()).toEqual("1.2");
    expect(positionB.realized.toString()).toEqual("1.3");
    expect(positionB.frozenFunds.toString()).toEqual("1.2");

    expect(positionC.netPosition.toString()).toEqual("2");
    expect(positionC.averagePrice.toString()).toEqual("0.6");
    expect(positionC.unrealized.toString()).toEqual("0.4");
    expect(positionC.realized.toString()).toEqual("0.6");
    expect(positionC.frozenFunds.toString()).toEqual("-0.8");

    // TODO chwy this passes with "0.4" but the value from sheet is "2.4"; the FF for all outcomes changes in this last State; frozen funds should only change for traded outcome, right?
    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(0.4).plus(validityBondSumInEth).toString());
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
      numFillerTokens: ethToWei(bn(300)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "SHORT_180",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3),
      numFillerTokens: ethToWei(bn(390)),
      numFillerShares: ZERO,
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "LONG_202",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(4),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(4),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "LONG_205",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(11),
      numFillerTokens: ethToWei(bn(450)),
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(1),
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: longShareToken,
      filler: account,
      orderId: "SHORT_150",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(7),
      numFillerTokens: ZERO,
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(7),
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
    const {
      frozenFundsTotal,
      tradingPositions,
    } = await getUserTradingPositions({
      universe,
      account,
      marketId,
      outcome: null,
      sortBy: null,
      isSortDescending: null,
      limit: null,
      offset: null,
    });

    expect(tradingPositions.length).toEqual(1);

    expect(tradingPositions[0].netPosition.toString()).toEqual("-3");
    expect(tradingPositions[0].averagePrice.toString()).toEqual("205");
    expect(tradingPositions[0].unrealized.toString()).toEqual("165");
    expect(tradingPositions[0].realized.toString()).toEqual("458");
    expect(tradingPositions[0].frozenFunds.toString()).toEqual("135");

    expect(frozenFundsTotal.frozenFunds.toString()).toEqual(bn(135).plus(validityBondSumInEth).toString());
  });
});

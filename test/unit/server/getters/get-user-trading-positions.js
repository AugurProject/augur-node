jest.mock("src/blockchain/process-block");
const Augur = require("augur.js");
const { BigNumber } = require("bignumber.js");
const { setupTestDb, makeLogFactory } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const processBlock= require("src/blockchain/process-block");
const { updateMarketState } = require("src/blockchain/log-processors/database");
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
      tradingPositionsPerMarket,
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

    expect(tradingPositions[0].netPosition).toEqual("-7");
    expect(tradingPositions[0].averagePrice).toEqual("0.65");
    expect(tradingPositions[0].unrealized).toEqual("0.49");
    expect(tradingPositions[0].realized).toEqual("0.21");
    expect(tradingPositions[0].frozenFunds).toEqual("2.45");
    expect(tradingPositions[0].unrealizedCost).toEqual("2.45");
    expect(tradingPositions[0].unrealizedRevenue).toEqual("2.94");
    expect(tradingPositions[0].unrealizedPercent).toEqual("0.2");
    expect(tradingPositions[0].realizedCost).toEqual("1.05");
    expect(tradingPositions[0].realizedPercent).toEqual("0.2");
    expect(tradingPositions[0].totalCost).toEqual("3.5");
    expect(tradingPositions[0].total).toEqual("0.7");
    expect(tradingPositions[0].totalPercent).toEqual("0.2");

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("2.45");
    expect(market.unrealizedRevenue).toEqual("2.94");
    expect(market.unrealized).toEqual("0.49");
    expect(market.unrealizedPercent).toEqual("0.2");
    expect(market.realizedCost).toEqual("1.05");
    expect(market.realized).toEqual("0.21");
    expect(market.realizedPercent).toEqual("0.2");
    expect(market.totalCost).toEqual("3.5");
    expect(market.total).toEqual("0.7");
    expect(market.totalPercent).toEqual("0.2");
    expect(market.frozenFunds).toEqual("2.45");

    expect(frozenFundsTotal.frozenFunds).toEqual(bn(2.45).plus(validityBondSumInEth).toString());
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
      tradingPositionsPerMarket,
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

    expect(tradingPositions[0].averagePrice).toEqual("0.6305");
    expect(tradingPositions[0].netPosition).toEqual("-3");
    expect(tradingPositions[0].realized).toEqual("4.8785");
    expect(tradingPositions[0].unrealized).toEqual("1.4415");
    expect(tradingPositions[0].frozenFunds).toEqual("1.1085");
    expect(tradingPositions[0].unrealizedCost).toEqual("1.1085");
    expect(tradingPositions[0].unrealizedRevenue).toEqual("2.55");
    expect(parseFloat(tradingPositions[0].unrealizedPercent)).toBeCloseTo(1.300406);
    expect(tradingPositions[0].realizedCost).toEqual("7.3315");
    expect(parseFloat(tradingPositions[0].realizedPercent)).toBeCloseTo(0.6654164);
    expect(tradingPositions[0].totalCost).toEqual("8.44");
    expect(tradingPositions[0].total).toEqual("6.32");
    expect(parseFloat(tradingPositions[0].totalPercent)).toBeCloseTo(0.748815);

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("1.1085");
    expect(market.unrealizedRevenue).toEqual("2.55");
    expect(market.unrealized).toEqual("1.4415");
    expect(parseFloat(market.unrealizedPercent)).toBeCloseTo(1.300406);
    expect(market.realizedCost).toEqual("7.3315");
    expect(market.realized).toEqual("4.8785");
    expect(parseFloat(market.realizedPercent)).toBeCloseTo(0.6654164);
    expect(market.totalCost).toEqual("8.44");
    expect(market.total).toEqual("6.32");
    expect(parseFloat(market.totalPercent)).toBeCloseTo(0.748815);
    expect(market.frozenFunds).toEqual("1.1085");

    expect(frozenFundsTotal.frozenFunds).toEqual(bn(1.1085).plus(validityBondSumInEth).toString());
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
      tradingPositionsPerMarket,
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

    expect(positionA.netPosition).toEqual("0");
    expect(positionA.averagePrice).toEqual("0");
    expect(positionA.unrealized).toEqual("0");
    expect(positionA.realized).toEqual("0.3");
    expect(positionA.frozenFunds).toEqual("0");
    expect(positionA.unrealizedCost).toEqual("0");
    expect(positionA.unrealizedRevenue).toEqual("0");
    expect(parseFloat(positionA.unrealizedPercent)).toEqual(0);
    expect(positionA.realizedCost).toEqual("0.4");
    expect(parseFloat(positionA.realizedPercent)).toBeCloseTo(0.75);
    expect(positionA.totalCost).toEqual("0.4");
    expect(positionA.total).toEqual("0.3");
    expect(parseFloat(positionA.totalPercent)).toBeCloseTo(0.75);

    expect(positionB.netPosition).toEqual("-2");
    expect(positionB.averagePrice).toEqual("0.2");
    expect(positionB.unrealized).toEqual("0");
    expect(positionB.realized).toEqual("0");
    expect(positionB.frozenFunds).toEqual("1.6");
    expect(positionB.unrealizedCost).toEqual("1.6");
    expect(positionB.unrealizedRevenue).toEqual("1.6");
    expect(parseFloat(positionB.unrealizedPercent)).toEqual(0);
    expect(positionB.realizedCost).toEqual("0");
    expect(parseFloat(positionB.realizedPercent)).toEqual(0);
    expect(positionB.totalCost).toEqual("1.6");
    expect(positionB.total).toEqual("0");
    expect(parseFloat(positionB.totalPercent)).toEqual(0);

    expect(positionC.netPosition).toEqual("0.5");
    expect(positionC.averagePrice).toEqual("0.3");
    expect(positionC.unrealized).toEqual("0");
    expect(positionC.realized).toEqual("0");
    expect(positionC.frozenFunds).toEqual("0.15");
    expect(positionC.unrealizedCost).toEqual("0.15");
    expect(positionC.unrealizedRevenue).toEqual("0.15");
    expect(parseFloat(positionC.unrealizedPercent)).toEqual(0);
    expect(positionC.realizedCost).toEqual("0");
    expect(parseFloat(positionC.realizedPercent)).toEqual(0);
    expect(positionC.totalCost).toEqual("0.15");
    expect(positionC.total).toEqual("0");
    expect(parseFloat(positionC.totalPercent)).toEqual(0);

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("1.75");
    expect(market.unrealizedRevenue).toEqual("1.75");
    expect(market.unrealized).toEqual("0");
    expect(parseFloat(market.unrealizedPercent)).toEqual(0);
    expect(market.realizedCost).toEqual("0.4");
    expect(market.realized).toEqual("0.3");
    expect(parseFloat(market.realizedPercent)).toBeCloseTo(0.75);
    expect(market.totalCost).toEqual("2.15");
    expect(market.total).toEqual("0.3");
    expect(parseFloat(market.totalPercent)).toBeCloseTo(0.139534);
    expect(market.frozenFunds).toEqual("1.75");

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
      tradingPositionsPerMarket,
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

    expect(positionA.netPosition).toEqual("-5");
    expect(positionA.averagePrice).toEqual("0.4");
    expect(positionA.unrealized).toEqual("0");
    expect(positionA.realized).toEqual("0");
    expect(positionA.frozenFunds).toEqual("3");
    expect(positionA.unrealizedCost).toEqual("3");
    expect(positionA.unrealizedRevenue).toEqual("3");
    expect(parseFloat(positionA.unrealizedPercent)).toBeCloseTo(0);
    expect(positionA.realizedCost).toEqual("0");
    expect(parseFloat(positionA.realizedPercent)).toEqual(0);
    expect(positionA.totalCost).toEqual("3");
    expect(positionA.total).toEqual("0");
    expect(parseFloat(positionA.totalPercent)).toEqual(0);

    expect(positionB.netPosition).toEqual("-3");
    expect(positionB.averagePrice).toEqual("0.35");
    expect(positionB.unrealized).toEqual("0");
    expect(positionB.realized).toEqual("0");
    expect(positionB.frozenFunds).toEqual("-1.05");
    expect(positionB.unrealizedCost).toEqual("1.95");
    expect(positionB.unrealizedRevenue).toEqual("1.95");
    expect(parseFloat(positionB.unrealizedPercent)).toEqual(0);
    expect(positionB.realizedCost).toEqual("0");
    expect(parseFloat(positionB.realizedPercent)).toEqual(0);
    expect(positionB.totalCost).toEqual("1.95");
    expect(positionB.total).toEqual("0");
    expect(parseFloat(positionB.totalPercent)).toEqual(0);

    expect(positionC.netPosition).toEqual("-2");
    expect(positionC.averagePrice).toEqual("0.3");
    expect(positionC.unrealized).toEqual("0.4");
    expect(positionC.realized).toEqual("1.6");
    expect(positionC.frozenFunds).toEqual("-0.6");
    expect(positionC.unrealizedCost).toEqual("1.4");
    expect(positionC.unrealizedRevenue).toEqual("1.8");
    expect(parseFloat(positionC.unrealizedPercent)).toBeCloseTo(0.285714);
    expect(positionC.realizedCost).toEqual("5.6");
    expect(parseFloat(positionC.realizedPercent)).toBeCloseTo(0.285714);
    expect(positionC.totalCost).toEqual("7");
    expect(positionC.total).toEqual("2");
    expect(parseFloat(positionC.totalPercent)).toBeCloseTo(0.285714);

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("6.35");
    expect(market.unrealizedRevenue).toEqual("6.75");
    expect(market.unrealized).toEqual("0.4");
    expect(parseFloat(market.unrealizedPercent)).toBeCloseTo(0.06299);
    expect(market.realizedCost).toEqual("5.6");
    expect(market.realized).toEqual("1.6");
    expect(parseFloat(market.realizedPercent)).toBeCloseTo(0.285714);
    expect(market.totalCost).toEqual("11.95");
    expect(market.total).toEqual("2");
    expect(parseFloat(market.totalPercent)).toBeCloseTo(0.167364);
    expect(market.frozenFunds).toEqual("1.35");

    expect(frozenFundsTotal.frozenFunds).toEqual(bn(1.35).plus(validityBondSumInEth).toString());
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
      numFillerTokens: ethToWei(bn(1.8)),
      numFillerShares: new BigNumber(10).pow(14).multipliedBy(8),
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
      tradingPositionsPerMarket,
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

    expect(positionA.netPosition).toEqual("0");
    expect(positionA.averagePrice).toEqual("0");
    expect(positionA.unrealized).toEqual("0");
    expect(positionA.realized).toEqual("-0.5");
    expect(positionA.frozenFunds).toEqual("2");
    expect(positionA.unrealizedCost).toEqual("0");
    expect(positionA.unrealizedRevenue).toEqual("0");
    expect(parseFloat(positionA.unrealizedPercent)).toEqual(0);
    expect(positionA.realizedCost).toEqual("1.5");
    expect(parseFloat(positionA.realizedPercent)).toBeCloseTo(-0.33333);
    expect(positionA.totalCost).toEqual("1.5");
    expect(positionA.total).toEqual("-0.5");
    expect(parseFloat(positionA.totalPercent)).toBeCloseTo(-0.33333);

    expect(positionB.netPosition).toEqual("12");
    expect(positionB.averagePrice).toEqual("0.1");
    expect(positionB.unrealized).toEqual("1.2");
    expect(positionB.realized).toEqual("1.3");
    expect(positionB.frozenFunds).toEqual("1.2");
    expect(positionB.unrealizedCost).toEqual("1.2");
    expect(positionB.unrealizedRevenue).toEqual("2.4");
    expect(parseFloat(positionB.unrealizedPercent)).toEqual(1);
    expect(positionB.realizedCost).toEqual("1.3");
    expect(parseFloat(positionB.realizedPercent)).toEqual(1);
    expect(positionB.totalCost).toEqual("2.5");
    expect(positionB.total).toEqual("2.5");
    expect(parseFloat(positionB.totalPercent)).toEqual(1);

    expect(positionC.netPosition).toEqual("2");
    expect(positionC.averagePrice).toEqual("0.6");
    expect(positionC.unrealized).toEqual("0.4");
    expect(positionC.realized).toEqual("0.6");
    expect(positionC.frozenFunds).toEqual("-0.8");
    expect(positionC.unrealizedCost).toEqual("1.2");
    expect(positionC.unrealizedRevenue).toEqual("1.6");
    expect(parseFloat(positionC.unrealizedPercent)).toBeCloseTo(0.33333);
    expect(positionC.realizedCost).toEqual("1.8");
    expect(parseFloat(positionC.realizedPercent)).toBeCloseTo(0.33333);
    expect(positionC.totalCost).toEqual("3");
    expect(positionC.total).toEqual("1");
    expect(parseFloat(positionC.totalPercent)).toBeCloseTo(0.33333);

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("2.4");
    expect(market.unrealizedRevenue).toEqual("4");
    expect(market.unrealized).toEqual("1.6");
    expect(parseFloat(market.unrealizedPercent)).toBeCloseTo(0.66666);
    expect(market.realizedCost).toEqual("4.6");
    expect(market.realized).toEqual("1.4");
    expect(parseFloat(market.realizedPercent)).toBeCloseTo(0.3043478);
    expect(market.totalCost).toEqual("7");
    expect(market.total).toEqual("3");
    expect(parseFloat(market.totalPercent)).toBeCloseTo(0.428571);
    expect(market.frozenFunds).toEqual("2.4");

    expect(frozenFundsTotal.frozenFunds).toEqual(bn(2.4).plus(validityBondSumInEth).toString());
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
      tradingPositionsPerMarket,
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

    expect(tradingPositions[0].netPosition).toEqual("-3");
    expect(tradingPositions[0].averagePrice).toEqual("205");
    expect(tradingPositions[0].unrealized).toEqual("165");
    expect(tradingPositions[0].realized).toEqual("458");
    expect(tradingPositions[0].frozenFunds).toEqual("135");
    expect(tradingPositions[0].unrealizedCost).toEqual("135");
    expect(tradingPositions[0].unrealizedRevenue).toEqual("300");
    expect(parseFloat(tradingPositions[0].unrealizedPercent)).toBeCloseTo(1.222222);
    expect(tradingPositions[0].realizedCost).toEqual("1005");
    expect(parseFloat(tradingPositions[0].realizedPercent)).toBeCloseTo(0.45572139);
    expect(tradingPositions[0].totalCost).toEqual("1140");
    expect(tradingPositions[0].total).toEqual("623");
    expect(parseFloat(tradingPositions[0].totalPercent)).toBeCloseTo(0.54649123);

    const market = tradingPositionsPerMarket[marketId];
    expect(market.marketId).toEqual(marketId);
    expect(market.unrealizedCost).toEqual("135");
    expect(market.unrealizedRevenue).toEqual("300");
    expect(market.unrealized).toEqual("165");
    expect(parseFloat(market.unrealizedPercent)).toBeCloseTo(1.222222);
    expect(market.realizedCost).toEqual("1005");
    expect(market.realized).toEqual("458");
    expect(parseFloat(market.realizedPercent)).toBeCloseTo(0.45572139);
    expect(market.totalCost).toEqual("1140");
    expect(market.total).toEqual("623");
    expect(parseFloat(market.totalPercent)).toBeCloseTo(0.54649123);
    expect(market.frozenFunds).toEqual("135");

    expect(frozenFundsTotal.frozenFunds).toEqual(bn(135).plus(validityBondSumInEth).toString());
  });
});

describe("server/getters/get-user-trading-positions frozenFundsTotal ignores validityBondSize from finalized market", () => {
  let db;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var account = "0x0000000000000000000000000000000000b0b001";
  var marketId = "0x000000000000000000000000000000000000021c";

  beforeEach(async () => {
    processBlock.getCurrentTime.mockReturnValue(Date.now()/1000);
    db = await setupTestDb(augur, [], logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    await db.destroy();
  });

  const getUserTradingPositions = async (params) => {
    return JSON.parse(JSON.stringify(await dispatchJsonRpcRequest(db, { method: "getUserTradingPositions", params }, augur)));
  };

  it("get user's full position with no finalized market", async () => {
    const {
      frozenFundsTotal,
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

    expect(frozenFundsTotal.frozenFunds).toEqual(validityBondSumInEth.toString());
  });

  it("get user's full position, ignoring a finalized market", async () => {
    await updateMarketState(db,
      "0x100000000000000000001339000a000000000001",
      1, augur.constants.REPORTING_STATE.FINALIZED);

    const {
      frozenFundsTotal,
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

    const validityBondSizeEthFromFinalizedMarket = bn(0.0128);

    expect(frozenFundsTotal.frozenFunds).toEqual(validityBondSumInEth.minus(validityBondSizeEthFromFinalizedMarket).toString());
  });
});

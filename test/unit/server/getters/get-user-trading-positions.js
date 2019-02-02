jest.mock("src/blockchain/process-block");
const Augur = require("augur.js");
const { BigNumber } = require("bignumber.js");
const { setupTestDb, makeLogFactory } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const processBlock= require("src/blockchain/process-block");

describe("server/getters/get-user-trading-positions", () => {
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
      amountFilled: new BigNumber(10).pow(15) // 10 shares
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000002b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(3)
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000003b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(13)
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000004b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(10)
    }),
    logFactory.OrderFilled({
      universe,
      shareToken: yesShareToken,
      filler: account,
      orderId: "0x8000000000000000000000000000000000000000000000000000000000005b0b",
      amountFilled: new BigNumber(10).pow(14).multipliedBy(7)
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
    expect(userTradingPositions[0].position.toString()).toEqual("0");
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

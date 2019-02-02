jest.mock("src/blockchain/process-block");
const Augur = require("augur.js");
const { BigNumber } = require("bignumber.js");
const { setupTestDb, makeLogFactory } = require("test.database");
const { getProfitLoss, getProfitLossSummary, bucketRangeByInterval } = require("src/server/getters/get-profit-loss");
const processBlock = require("src/blockchain/process-block");

const BID = 0;
const ASK = 1;

describe("server/getters/get-profit-loss#bucketRangeByInterval", () => {
  test("throws when startTime is negative", (done) => {
    expect(() => bucketRangeByInterval(-1, 0, 1)).toThrow();
    done();
  });

  test("throws when endTime is negative", (done) => {
    expect(() => bucketRangeByInterval(0, -1, 1)).toThrow();
    done();
  });

  test("throws when periodInterval is negative", (done) => {
    expect(() => bucketRangeByInterval(0, 1, -1)).toThrow();
    done();
  });

  test("throws when periodInterval is zero", (done) => {
    expect(() => bucketRangeByInterval(0, 1, 0)).toThrow();
    done();
  });

  test("throws when startTime is greater than endTime", (done) => {
    expect(() => bucketRangeByInterval(1, 0, 1)).toThrow();
    done();
  });

  test("Does not throw when startTime is equal to endTime", (done) => {
    expect(() => bucketRangeByInterval(0, 0, 1)).not.toThrow();
    done();
  });

  test("generates a range including only startTime and endTime", (done) => {
    const buckets = bucketRangeByInterval(10000, 10040, 20000);
    expect(buckets).toEqual([
      {
        timestamp: 10000,
      },
      {
        timestamp: 10040,
      },
    ]);

    done();
  });

  it("generates a range of 5 buckets, including start and end times every 10 seconds", (done) => {
    const buckets = bucketRangeByInterval(10000, 10040, 10);
    expect(buckets).toEqual([
      {
        timestamp: 10000,
      },
      {
        timestamp: 10010,
      },
      {
        timestamp: 10020,
      },
      {
        timestamp: 10030,
      },
      {
        timestamp: 10040,
      },
    ]);

    done();
  });

  test("generates 31 buckets with explicit periodInteval", (done) => {
    const buckets = bucketRangeByInterval(0, 30 * 86400, 86400);
    expect(buckets.length).toEqual(31);

    done();
  });

  test("generates 31 buckets with implicit periodInteval", (done) => {
    const buckets = bucketRangeByInterval(0, 30 * 86400);
    expect(buckets.length).toEqual(31);

    done();
  });
});


describe("server/getters/get-profit-loss#getProfitLoss", () => {
  var connection = null;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var yesShareToken = "0x0124000000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
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
    connection = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    if (connection) await connection.destroy();
  });

  it("generates a 31-value timeseries P/L", async () => {
    const results = await getProfitLoss(connection, augur, {
      universe: "0x000000000000000000000000000000000000000b",
      account:  "0xffff000000000000000000000000000000000000",
      marketId: "0x0000000000000000000000000000000000000ff1",
    });

    expect(results.length).toEqual(31);
  });

  it("generates a 5-value timeseries P/L", async () => {
    const startTime = 1534320908;
    const endTime = 1534417613;
    const periodInterval = (endTime - startTime)/4;
    const results = await getProfitLoss(connection, augur, {
      universe: "0x000000000000000000000000000000000000000b",
      account:  "0xffff000000000000000000000000000000000000",
      marketId: "0x0000000000000000000000000000000000000ff1",
      startTime,
      endTime,
      periodInterval,
    });

    expect(results.length).toEqual(5);
  });

  it("generates a 1-value timeseries P/L", async () => {
    const results = await getProfitLoss(connection, augur, {
      universe,
      account,
      marketId: "0x0000000000000000000000000000000000000211",
    });

    expect(results.length).toEqual(1);
    
    expect(results[0].netPosition.toString()).toEqual("-3");
    expect(results[0].averagePrice.toString()).toEqual("0.6305");
    expect(results[0].unrealized.toString()).toEqual("1.4415");
    expect(results[0].realized.toString()).toEqual("4.8785");
  });
});

describe("server/getters/get-profit-loss#getProfitLossSummary", () => {
  var connection = null;
  var augur = new Augur();
  var universe = "0x000000000000000000000000000000000000000b";
  var logFactory = makeLogFactory(universe);
  var yesShareToken = "0x0124000000000000000000000000000000000000";
  var account = "0x0000000000000000000000000000000000b0b001";
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
    connection = await setupTestDb(augur, logs, logFactory.getBlockDetails(), true);
  });

  afterEach(async () => {
    if (connection) await connection.destroy();
  });

  it("returns 0-value 1-day and 30-day PLs", async() => {
    const results = await getProfitLossSummary(connection, augur, {
      universe: "0x000000000000000000000000000000000000000b",
      account:  "0xffff000000000000000000000000000000000000",
      marketId: "0x0000000000000000000000000000000000000ff1",
    });

    const deserialized = JSON.parse(JSON.stringify(results));

    expect(Object.keys(deserialized)).toEqual(expect.arrayContaining(["1", "30"]));
    expect(deserialized["1"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
    expect(deserialized["30"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
  });

  it("returns 1-day and 30-day PLs at endtime", async() => {
    const results = await getProfitLossSummary(connection, augur, {
      universe,
      account,
      marketId: "0x0000000000000000000000000000000000000211",
      endTime: Date.now() / 1000,
    });

    const deserialized = JSON.parse(JSON.stringify(results));
    expect(Object.keys(deserialized)).toEqual(expect.arrayContaining(["1", "30"]));
    expect(deserialized["1"].realized.toString()).toEqual("4.8785");
    expect(deserialized["1"].unrealized.toString()).toEqual("1.4415");
    expect(deserialized["30"].realized.toString()).toEqual("4.8785");
    expect(deserialized["30"].unrealized.toString()).toEqual("1.4415");
  });

  it("returns returns zero-value PLs for nonexistent account", async() => {
    const results = await getProfitLossSummary(connection, augur, {
      universe: "0x000000000000000000000000000000000000000b",
      account:  "0xbadf000000000000000000000000000000000000",
      marketId: "0x0000000000000000000000000000000000000ff1",
    });
    const deserialized = JSON.parse(JSON.stringify(results));

    expect(Object.keys(deserialized)).toEqual(expect.arrayContaining(["1", "30"]));
    expect(deserialized["1"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
    expect(deserialized["30"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
  });

  it("returns returns zero-value PLs for nonexistent market", async() => {
    const results = await getProfitLossSummary(connection, augur, {
      universe: "0x000000000000000000000000000000000000000b",
      account:  "0xffff000000000000000000000000000000000000",
      marketId: "0xbad0000000000000000000000000000000000ff1",
    });
    const deserialized = JSON.parse(JSON.stringify(results));

    expect(Object.keys(deserialized)).toEqual(expect.arrayContaining(["1", "30"]));
    expect(deserialized["1"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
    expect(deserialized["30"]).toMatchObject({
      realized: "0",
      unrealized: "0",
      total: "0",
      position: "0",
    });
  });
});

const { setupTestDb, seedDb } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const { BigNumber } = require("bignumber.js");

describe("server/getters/get-platform-activity-stats", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("get platform activity stats", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      endTime: null,
    };
    const stats = await dispatchJsonRpcRequest(db, {
      method: "getPlatformActivityStats",
      params,
    }, null);
    expect(stats).toEqual({
      "activeUsers": new BigNumber(12, 10),
      "marketsCreated": new BigNumber(15, 10),
      "moneyAtStake": new BigNumber(17, 10),
      "numberOfTrades": new BigNumber(13, 10),
      "openInterest": new BigNumber(14, 10),
      "volume": new BigNumber(16, 10),
    });
  });
});

const { setupTestDb, seedDb } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");

describe("server/getters/get-account-time-ranged-stats", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("get account time ranged-status", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x000000000000000000000000000000000000000c",
      endTime: null,
      startTime: null,
    };
    await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).resolves.toEqual({
      "marketsCreated": 0,
      "marketsTraded": 0,
      "numberOfTrades": 0,
      "positions": 0,
      "redeemedPositions": 0,
      "successfulDisputes": 0,
    });
  });
});

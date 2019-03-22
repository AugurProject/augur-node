import { setupTestDb, seedDb } from "test.database";
import { dispatchJsonRpcRequest } from "src/server/dispatch-json-rpc-request";

describe("server/getters/get-account-time-ranged-stats", () => {
  let db;
  beforeEach(async () => {
    return db = await setupTestDb().then(seedDb);
  });

  afterEach(async () => {
    return await db.destroy();
  });

  test("main stats query", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      endTime: null,
      startTime: null,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).resolves.toEqual({
      "marketsCreated": 15,
      "marketsTraded": 8,
      "numberOfTrades": 11,
      "positions": 2,
      "redeemedPositions": 0,
      "successfulDisputes": 0,
    });
  });

  test("get successfulDisputes and redeemedPositions", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0c",
      endTime: null,
      startTime: null,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).resolves.toEqual({
      "marketsCreated": 0,
      "marketsTraded": 0,
      "numberOfTrades": 0,
      "positions": 0,
      "redeemedPositions": 1,
      "successfulDisputes": 1,
    });
  });

  test("start time after end time", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0c",
      endTime: 1,
      startTime: 2,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).rejects.toEqual(new Error("startTime must be less than or equal to endTime"));
  });

  test("main stats query in specific time range", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      startTime: 1000000,
      endTime: 1506480016,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).resolves.toEqual({
      "marketsCreated": 15,
      "marketsTraded": 8,
      "numberOfTrades": 11,
      "positions": 2,
      "redeemedPositions": 0,
      "successfulDisputes": 0,
    });
  });

  test("main stats query in specific time range beyond available block numbers", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      startTime: 1000000,
      endTime: 1606480016,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getAccountTimeRangedStats",
      params,
    }, null)).rejects.toEqual(new Error("startTime/endTime error"));
  });
});

import * as Knex from "knex";
import { setupTestDb, seedDb, makeMockAugur } from "test.database";
import { dispatchJsonRpcRequest } from "src/server/dispatch-json-rpc-request";
import { BigNumber } from "bignumber.js";

const augur = makeMockAugur({
  api: {
    Universe: {
      getOpenInterestInAttoEth: () => 54321,
    },
  },
});

describe("server/getters/get-platform-activity-stats", () => {
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
      endTime: null,
      startTime: null,
    };
    return await expect(dispatchJsonRpcRequest(db, {
      method: "getPlatformActivityStats",
      params,
    }, augur)).resolves.toEqual({
      "activeUsers": new BigNumber("6", 10),
      "amountStaked": new BigNumber("1259", 10),
      "disputedMarkets": new BigNumber("4", 10),
      "marketsCreated": new BigNumber("17", 10),
      "numberOfTrades": new BigNumber("11", 10),
      "openInterest": new BigNumber("54321", 10),
      "volume": new BigNumber("3.8", 10),
    });
  });

  test("start time after end time", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      endTime: 1,
      startTime: 2,
    };

    return await expect(dispatchJsonRpcRequest(db, {
      method: "getPlatformActivityStats",
      params,
    }, augur)).rejects.toEqual(new Error("startTime must be less than or equal to endTime"));
  });

  test("main stats query in specific time range", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      startTime: 1000000,
      endTime: 1506480016,
    };

    return await expect(dispatchJsonRpcRequest(db, {
      method: "getPlatformActivityStats",
      params,
    }, augur)).resolves.toEqual({
      "activeUsers": new BigNumber("6", 10),
      "amountStaked": new BigNumber("1259", 10),
      "disputedMarkets": new BigNumber("4", 10),
      "marketsCreated": new BigNumber("17", 10),
      "numberOfTrades": new BigNumber("11", 10),
      "openInterest": new BigNumber("54321", 10),
      "volume": new BigNumber("3.8", 10),
    });
  });

  test("main stats query in specific time range beyond available block numbers", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
      startTime: 1000000,
      endTime: 1606480016,
    };

    return await expect(dispatchJsonRpcRequest(db, {
      method: "getPlatformActivityStats",
      params,
    }, augur)).rejects.toEqual(new Error("startTime/endTime error"));
  });
});

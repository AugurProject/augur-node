const { setupTestDb, seedDb } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");
const { MAX_SPREAD_PERCENT } = require("src/utils/liquidity");

describe("server/getters/get-categories", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("get categories in universe b sorted by popularity", async () => {
    const params = {
      universe: "0x000000000000000000000000000000000000000b",
    };

    // getCategories only returns categories that have markets that have liquidity data. Instead of making new seeds we insert seed data here.
    for (const { marketId } of await db.select("marketId").from("markets")) {
      await db("outcomes_liquidity").insert({
        marketId,
        outcome: 1,
        spreadPercent: MAX_SPREAD_PERCENT,
        liquidityTokens: 1,
      });
    }

    await expect(dispatchJsonRpcRequest(db, {
      method: "getCategories",
      params,
    }, null)).resolves.toEqual([
      {
        "categoryName": "TEST CATEGORY",
        "nonFinalizedOpenInterest": "4.16",
        "openInterest": "4.16",
        "liquidityTokens": "16",
        "tags": [
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 6, "openInterest": "0", "liquidityTokens": "6", "tagName": "test tag 1"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 6, "openInterest": "0", "liquidityTokens": "6", "tagName": "test tag 2"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 2, "openInterest": "0", "liquidityTokens": "2", "tagName": "Finance"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 2, "openInterest": "0", "liquidityTokens": "2", "tagName": "Augur"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 1, "openInterest": "0", "liquidityTokens": "1", "tagName": "politics"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 1, "openInterest": "0", "liquidityTokens": "1", "tagName": "ethereum"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 5, "openInterest": "0", "liquidityTokens": "5", "tagName": "tagging it"},
          {"nonFinalizedOpenInterest": "0", "numberOfMarketsWithThisTag": 5, "openInterest": "0", "liquidityTokens": "5", "tagName": "tagged it"},
        ]},
      {
        "categoryName": "TeSt CaTeGoRy",
        "nonFinalizedOpenInterest": "0",
        "openInterest": "0",
        "liquidityTokens": "1",
        "tags": [
          {
            "nonFinalizedOpenInterest": "0",
            "numberOfMarketsWithThisTag": 1,
            "openInterest": "0",
            "liquidityTokens": "1",
            "tagName": "tEsT tag 1",
          },
          {
            "nonFinalizedOpenInterest": "0",
            "numberOfMarketsWithThisTag": 1,
            "openInterest": "0",
            "liquidityTokens": "1",
            "tagName": "test tag 2",
          },
        ],
      },
    ]);
  });

  test("get categories in bad universe", async () => {
    const params = {
      universe: "0x0000000000000000000000000FFFFFFFFFFEAAAA",
    };
    await expect(dispatchJsonRpcRequest(db, { method: "getCategories", params }, null))
      .rejects.toEqual(new Error("Universe 0x0000000000000000000000000FFFFFFFFFFEAAAA does not exist"));
  });
});

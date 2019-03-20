const { setupTestDb, seedDb } = require("test.database");
const { dispatchJsonRpcRequest } = require("src/server/dispatch-json-rpc-request");

describe("server/getters/get-account-transaction-history", () => {
  let db;
  beforeEach(async () => {
    db = await setupTestDb().then(seedDb);
  });

  afterEach(async () => {
    await db.destroy();
  });
  const runTest = (t) => {
    test(t.description, async () => {
      t.method = "getAccountTransactionHistory";
      const accountTransactionHistory = await dispatchJsonRpcRequest(db, t, null);
      t.assertions(accountTransactionHistory);
    });
  };
  runTest({
    description: "get account transaction history for 0x0000000000000000000000000000000000000b0b",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      account: "0x0000000000000000000000000000000000000b0b",
      earliestTransactionTime: 0,
      latestTransactionTime: 1552994714,
      denomination: "ETH",
    },
    assertions: (accountTransactionHistory) => {
      console.log(accountTransactionHistory);
    },
  });
});

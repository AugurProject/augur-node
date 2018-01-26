"use strict";

const assert = require("chai").assert;
const setupTestDb = require("../../test.database");
const { getMarketsCreatedByUser } = require("../../../build/server/getters/get-markets-created-by-user");

describe("server/getters/get-markets-created-by-user", () => {
  const test = (t) => {
    it(t.description, (done) => {
      setupTestDb((err, db) => {
        assert.isNull(err);
        getMarketsCreatedByUser(db, t.params.universe, t.params.creator, t.params.sortBy, t.params.isSortDescending, t.params.limit, t.params.offset, (err, marketsCreatedByUser) => {
          t.assertions(err, marketsCreatedByUser);
          done();
        });
      });
    });
  };
  test({
    description: "user has created 11 markets",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      creator: "0x0000000000000000000000000000000000000b0b",
    },
    assertions: (err, marketsCreatedByUser) => {
      assert.isNull(err);
      assert.deepEqual(marketsCreatedByUser.map((marketRow) => marketRow.marketID), [
        "0x0000000000000000000000000000000000000012",
        "0x0000000000000000000000000000000000000013",
        "0x0000000000000000000000000000000000000014",
        "0x0000000000000000000000000000000000000015",
        "0x0000000000000000000000000000000000000016",
        "0x0000000000000000000000000000000000000017",
        "0x0000000000000000000000000000000000000018",
        "0x0000000000000000000000000000000000000019",
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000011",
      ]);
      assert.isTrue(marketsCreatedByUser.every((market) => !isNaN(market.creationTime)));
      assert.equal(1506480000, marketsCreatedByUser[9].creationTime);
    },
  });
  test({
    description: "user has created 1 market",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      creator: "0x000000000000000000000000000000000000d00d",
    },
    assertions: (err, marketsCreatedByUser) => {
      assert.isNull(err);
      assert.deepEqual(marketsCreatedByUser, [{
        creationTime: 1506480015,
        marketID: "0x0000000000000000000000000000000000000003",
      }]);
    },
  });
  test({
    description: "user has not created any markets",
    params: {
      universe: "0x000000000000000000000000000000000000000b",
      creator: "0x0000000000000000000000000000000000000bbb",
    },
    assertions: (err, marketsCreatedByUser) => {
      assert.isNull(err);
      assert.deepEqual(marketsCreatedByUser, []);
    },
  });
});

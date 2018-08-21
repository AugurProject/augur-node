"use strict";

import { assert } from "chai";
import {
  processDisputeCrowdsourcerRedeemedLog,
  processDisputeCrowdsourcerRedeemedLogRemoval,
} from "../../../../src/blockchain/log-processors/crowdsourcer";

import { setupTestDb } from "../../test.database";
import * as Knex from "knex";

describe("blockchain/log-processors/crowdsourcer-redeemed", () => {
  const getRedeemed = (db: Knex, callback) => db.select(["reporter", "crowdsourcer", "amountRedeemed", "repReceived", "reportingFeesReceived"]).from("crowdsourcer_redeemed").asCallback(callback);
  it("Redeemed", (done) => {
    const log = {
        transactionHash: "TRANSACTION_HASH",
        logIndex: 0,
        blockNumber: 1400101,
        reporter: "REPORTER",
        disputeCrowdsourcer: "DISPUTE_CROWDSOURCER",
        amountRedeemed: "200",
        repReceived: "400",
        reportingFeesReceived: "900",
      };
    setupTestDb((err, db: Knex) => {
      assert.ifError(err);
      db.transaction((trx) => {
        processDisputeCrowdsourcerRedeemedLog(trx, undefined, log, (err:Error) => {
          assert.ifError(err);
          getRedeemed(trx, (err: Error, records) => {
            assert.ifError(err);
            assert.deepEqual(records, [{
              amountRedeemed: "200",
              crowdsourcer: "DISPUTE_CROWDSOURCER",
              repReceived: "400",
              reporter: "REPORTER",
              reportingFeesReceived: "900",
            }]);
            processDisputeCrowdsourcerRedeemedLogRemoval(trx, undefined, params.log, (err: Error) => {
              assert.ifError(err);
              getRedeemed(trx, (err: Error, records) => {
                assert.ifError(err);
                assert.deepEqual(records, []);
                db.destroy();
                done();
              });
            });
          });
        });
      });
    });
  });
});

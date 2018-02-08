import Augur from "augur.js";
import { parallel } from "async";
import * as Knex from "knex";
import { each } from "async";
import { augurEmitter } from "../events";
import { logError } from "../utils/log-error";
import { Block, BlocksRow, AsyncCallback, ErrorCallback, MarketsContractAddressRow } from "../types";
import { updateMarketState } from "./log-processors/database";
import { processQueue, blockPriority } from "./process-queue";
import { QueryBuilder } from "knex";

interface FeeWindowIDRow {
  feeWindowID: number;
}

export function processBlock(db: Knex, augur: Augur, block: Block): void {
  processQueue.push((callback) => _processBlock(db, augur, block, callback), blockPriority(parseInt(block.number, 16)));
}

export function processBlockRemoval(db: Knex, block: Block): void {
  processQueue.push((callback) => _processBlockRemoval(db, block, callback), blockPriority(parseInt(block.number, 16)));
}

export function processBlockByNumber(db: Knex, augur: Augur, blockNumber: number, callback: ErrorCallback): void {
  augur.rpc.eth.getBlockByNumber([blockNumber, false], (block: Block): void => {
    _processBlock(db, augur, block, callback);
  });
}

function _processBlock(db: Knex, augur: Augur, block: Block, callback: ErrorCallback): void {
  if (!block || !block.timestamp) return logError(new Error(JSON.stringify(block)));
  const blockNumber = parseInt(block.number, 16);
  const blockHash = block.hash;
  const timestamp = parseInt(block.timestamp, 16);
  console.log("new block:", blockNumber, timestamp);
  db.transaction((trx: Knex.Transaction): void => {
    trx("blocks").where({ blockNumber }).asCallback((err: Error|null, blocksRows?: Array<BlocksRow>): void => {
      if (err) {
        trx.rollback();
        return logError(err);
      }
      let query: Knex.QueryBuilder;
      if (!blocksRows || !blocksRows.length) {
        query = db.transacting(trx).insert({ blockNumber, blockHash, timestamp }).into("blocks");
      } else {
        query = db("blocks").transacting(trx).where({ blockNumber }).update({ blockHash, timestamp });
      }
      query.asCallback((err: Error|null): void => {
        if (err) {
          trx.rollback(err);
          logError(err);
        } else {
          advanceTime(trx, augur, blockNumber, timestamp, (err: Error|null) => {
            if (err != null) {
              trx.rollback(err);
              logError(err);
              callback(err);
            } else {
              trx.commit();
              console.log("finished block:", blockNumber, timestamp);
              callback(null);
            }
          });
        }
      });
    });
  });
}

function _processBlockRemoval(db: Knex, block: Block, callback: ErrorCallback): void {
  const blockNumber = parseInt(block.number, 16);
  console.log("block removed:", blockNumber);
  db.transaction((trx: Knex.Transaction): void => {
    db("blocks").transacting(trx).where({ blockNumber }).del().asCallback((err: Error|null): void => {
      if (err) {
        trx.rollback(err);
        logError(err);
        callback(err);
      } else {
        trx.commit();
        callback(null);
      }
    });
  });
}

function advanceTime(db: Knex, augur: Augur, blockNumber: number, timestamp: number, callback: AsyncCallback) {
  parallel([
    (next: AsyncCallback) => advanceMarketReachingEndTime(db, augur, blockNumber, timestamp, next),
    (next: AsyncCallback) => advanceFeeWindowActive(db, blockNumber, timestamp, next),
  ], callback);
}

function advanceMarketReachingEndTime(db: Knex, augur: Augur, blockNumber: number, timestamp: number, callback: AsyncCallback) {
  const designatedDisputeQuery = db("markets").select("markets.marketID").join("market_state", "market_state.marketStateID", "markets.marketStateID");
  designatedDisputeQuery.where("reportingState", augur.constants.REPORTING_STATE.PRE_REPORTING).where("endTime", "<", timestamp);
  designatedDisputeQuery.asCallback((err: Error|null, designatedDisputeMarketIDs: Array<MarketsContractAddressRow>) => {
    if (err) return callback(err);
    each(designatedDisputeMarketIDs, (marketIDRow, nextMarketID: ErrorCallback) => {
      updateMarketState(db, marketIDRow.marketID, blockNumber, augur.constants.REPORTING_STATE.DESIGNATED_REPORTING, (err: Error|null) => {
        if (err) return nextMarketID(err);
        augurEmitter.emit("MarketState", {
          marketID: marketIDRow.marketID,
          reportingState: augur.constants.REPORTING_STATE.DESIGNATED_REPORTING,
        });
        nextMarketID();
      });
    }, callback);
  });
}

function advanceFeeWindowActive(db: Knex, blockNumber: number, timestamp: number, callback: AsyncCallback) {
  db("fee_windows").first().select("feeWindowID").where("endTime", "<", timestamp).whereNull("endBlockNumber").asCallback((err: Error|null, feeWindowRow?: FeeWindowIDRow) => {
    if (err || feeWindowRow == null) return callback(err);
    db("fee_windows").update("endBlockNumber", blockNumber).where("feeWindowID", feeWindowRow.feeWindowID).asCallback((err: Error|null) => {
      if (err) return callback(err);
      advanceIncompleteCrowdsourcers(db, blockNumber, timestamp, (err: Error|null) => {
        if (err) return callback(err);
        augurEmitter.emit("FeeWindowClosed", { feeWindowID: feeWindowRow.feeWindowID, blockNumber, timestamp });
        callback(null);
      });
    });
  });
}

function advanceIncompleteCrowdsourcers(db: Knex, blockNumber: number, timestamp: number, callback: AsyncCallback) {
  // Finds crowdsourcers rows that we don't know the completion of, but are attached to feeWindows that have ended
  // They did not reach their goal, so set completed to 0.
  db("crowdsourcers").update("completed", 0)
    .whereNull("completed")
    .whereIn("feeWindow", (subQuery: QueryBuilder) => {
      subQuery.select("feeWindow").from("fee_windows").whereNotNull("endBlockNumber");
    })
    .asCallback(callback);
}

import Augur from "augur.js";
import * as Knex from "knex";
import { FormattedEventLog, ErrorCallback, CategoriesRow, CategoryRow, ReportingState } from "../../types";
import { rollbackMarketState, updateMarketFeeWindow, updateMarketState } from "./database";

export function processMarketMigratedLog(db: Knex, augur: Augur, log: FormattedEventLog, callback: ErrorCallback): void {
  updateMarketState(db, log.market, log.blockNumber, ReportingState.AWAITING_NEXT_WINDOW, (err) => {
    if (err) return callback(err);
    updateMarketFeeWindow(db, augur, log.newUniverse, log.market, true, (err) => {
      if (err) return callback(err);
      db.update({
        universe: log.newUniverse,
        needsMigration: db.raw("needsMigration - 1"),
        needsDisavowal: db.raw("needsDisavowal - 1"),
      }).into("markets").where("marketId", log.market).asCallback((err) => {
        if (err) return callback(err);
        db.update({
          disavowed: db.raw("disavowed + 1"),
        }).into("crowdsourcers").where("marketId", log.market).asCallback((err) => {
          if (err) return callback(err);
          db.select("category").from("markets").where({ marketId: log.market }).asCallback((err: Error|null, categoryRows?: Array<CategoryRow>): void => {
            if (err) return callback(err);
            if (!categoryRows || !categoryRows.length) return callback(null);
            const category = categoryRows[0].category;
            db.select("popularity").from("categories").where({ category, universe: log.newUniverse }).asCallback((err: Error|null, categoriesRows?: Array<CategoriesRow>): void => {
              if (err) return callback(err);
              if (categoriesRows && categoriesRows.length) return callback(null);
              db.insert({ category, universe: log.newUniverse }).into("categories").asCallback(callback);
            });
          });
        });
      });
    });
  });
}

export function processMarketMigratedLogRemoval(db: Knex, augur: Augur, log: FormattedEventLog, callback: ErrorCallback): void {
  rollbackMarketState(db, log.market, ReportingState.AWAITING_NEXT_WINDOW, (err) => {
    db.update({
      universe: log.originalUniverse,
      needsMigration: db.raw("needsMigration + 1"),
      needsDisavowal: db.raw("needsDisavowal + 1"),
    }).into("markets").where("marketId", log.market).asCallback((err) => {
      if (err) return callback(err);
      db.update({
        disavowed: db.raw("disavowed - 1"),
      }).into("crowdsourcers").where("marketId", log.market).asCallback(callback);
    });
  });
}

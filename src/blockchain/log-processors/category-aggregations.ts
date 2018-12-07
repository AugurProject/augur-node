import * as Knex from "knex";
import { ReportingState } from "../../types";

interface MarketOpenInterestChangedParams {
  db: Knex;
  // alternatively we could pass only `{ db, marketId, oldOpenInterest }` and read `newOpenInterest` and `reportingState` from the db.
  categoryName: string;
  newOpenInterest: BigNumber;
  oldOpenInterest: BigNumber;
  reportingState: ReportingState;
}

interface MarketFinalizedParams {
  db: Knex;
  marketId: string;
}

export async function updateCategoryAggregationsOnMarketOpenInterestChanged(params: MarketOpenInterestChangedParams): Promise<void> {
  // TODO add (newOpenInterest - oldOpenInterest) to category.openInterest
  if (params.reportingState !== ReportingState.FINALIZED) {
    // by definition, category.nonFinalizedOpenInterest ignores OI on finalized markets
    // TODO add (newOpenInterest - oldOpenInterest) to category.nonFinalizedOpenInterest
  }
  return Promise.resolve();
}

// precondition: market finalized in the db
export async function updateCategoryAggregationsOnMarketFinalized(params: MarketFinalizedParams): Promise<void> {
  // TODO subtract market.openInterest from category.nonFinalizedOpenInterest
  return Promise.resolve();
}

// precondition: market finalization rolled back in the db
export async function updateCategoryAggregationsOnMarketFinalizedRollback(params: MarketFinalizedParams): Promise<void> {
  // TODO add market.openInterest to category.nonFinalizedOpenInterest
  return Promise.resolve();
}

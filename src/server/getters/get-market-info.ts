import BigNumber from "bignumber.js";
import * as Knex from "knex";
import { Address, MarketsRow, OutcomesRow, UIMarketInfo, UIConsensusInfo, UIOutcomeInfo } from "../../types";

export function reshapeOutcomesRowToUIOutcomeInfo(outcomesRow: OutcomesRow): UIOutcomeInfo {
  const outcomeInfo: UIOutcomeInfo = {
    id: outcomesRow.outcome,
    outstandingShares: outcomesRow.sharesOutstanding,
    price: outcomesRow.price
  };
  return outcomeInfo;
}

export function reshapeMarketsRowToUIMarketInfo(row: MarketsRow, outcomesInfo: Array<UIOutcomeInfo>): UIMarketInfo {
  let consensus: UIConsensusInfo|null;
  if (row.consensusOutcome === null) {
    consensus = null;
  } else {
    consensus = { outcomeID: row.consensusOutcome, isIndeterminate: row.isInvalid } as UIConsensusInfo;
  }
  const marketInfo: UIMarketInfo = {
    id: row.marketID,
    branchID: row.universe,
    type: row.marketType,
    numOutcomes: row.numOutcomes,
    minPrice: row.minPrice,
    maxPrice: row.maxPrice,
    cumulativeScale: new BigNumber(row.maxPrice, 10).minus(new BigNumber(row.minPrice, 10)).toFixed(),
    author: row.marketCreator,
    creationTime: row.creationTime,
    creationBlock: row.creationBlockNumber,
    creationFee: row.creationFee,
    marketCreatorFeeRate: row.marketCreatorFeeRate,
    marketCreatorFeesCollected: row.marketCreatorFeesCollected,
    topic: row.topic,
    tags: [row.tag1, row.tag2],
    volume: row.volume,
    outstandingShares: row.sharesOutstanding,
    reportingWindow: row.reportingWindow,
    endDate: row.endTime,
    finalizationTime: row.finalizationTime,
    description: row.shortDescription,
    extraInfo: row.longDescription,
    designatedReporter: row.designatedReporter,
    designatedReportStake: row.designatedReportStake,
    resolutionSource: row.resolutionSource,
    numTicks: row.numTicks,
    consensus,
    outcomes: outcomesInfo
  };
  return marketInfo;
}

export function getMarketInfo(db: Knex, marketID: string, callback: (err?: Error|null, result?: UIMarketInfo) => void): void {
  db.raw("SELECT * FROM markets WHERE marketID = ? LIMIT 1", [marketID]).asCallback((err?: Error|null, rows?: Array<MarketsRow>): void => {
    if (err) return callback(err);
    if (!rows || rows.length === 0) return callback(null);
    const marketsRow: MarketsRow = rows[0];
    db.raw("SELECT * FROM outcomes WHERE marketID = ?", [marketID]).asCallback((err?: Error|null, outcomesRows?: Array<OutcomesRow>): void => {
      if (err) return callback(err);
      const outcomesInfo: Array<UIOutcomeInfo> = outcomesRows!.map((outcomesRow: OutcomesRow): UIOutcomeInfo => reshapeOutcomesRowToUIOutcomeInfo(outcomesRow));
      callback(null, reshapeMarketsRowToUIMarketInfo(marketsRow, outcomesInfo));
    });
  });
}

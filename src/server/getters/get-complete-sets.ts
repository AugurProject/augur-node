import * as Knex from "knex";
import { Address, CompleteSetsRow } from "../../types";
import { formatBigNumberAsFixed } from "../../utils/format-big-number-as-fixed";

export interface CompleteSets {
  [orderId: string]: CompleteSetsRow<string>;
}

export function getCompleteSets(db: Knex, account: Address, callback: (err: Error|null, result?: CompleteSets) => void): void {
  const query = db.select("*").from("completeSets")
    .where("account", account);
  query.leftJoin("blocks", "completeSets.blockNumber", "blocks.blockNumber");
  query.asCallback((err: Error|null, completeSets?: Array<CompleteSetsRow<BigNumber>>): void => {
    if (err) return callback(err);
    if (!completeSets) return callback(err, {});
    callback(null, completeSets.reduce((acc: CompleteSets, cur: CompleteSetsRow<BigNumber>) => {
      acc[cur.transactionHash] = formatBigNumberAsFixed<CompleteSetsRow<BigNumber>, CompleteSetsRow<string>>({
        account: cur.account,
        timestamp: cur.timestamp,
        blockNumber: cur.blockNumber,
        transactionHash: cur.transactionHash,
        logIndex: cur.logIndex,
        tradeGroupId: cur.tradeGroupId,
        numCompleteSets: cur.numCompleteSets,
        numPurchasedOrSold: cur.numPurchasedOrSold,
        marketId: cur.marketId,
      });
      return acc;
    }, {}));
  });
}

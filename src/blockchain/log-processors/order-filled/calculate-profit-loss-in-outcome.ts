import { Augur, CalculatedProfitLoss } from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Address, OutcomesRow, UITrade } from "../../../types";
import { getUserTradingHistory } from "../../../server/getters/get-user-trading-history";
import { fixedPointToDecimal } from "../../../utils/convert-fixed-point-to-decimal";

export function calculateProfitLossInOutcome(db: Knex, augur: Augur, account: Address, marketId: Address, numTicks: BigNumber, outcome: number, callback: (err: (Error|null), profitLossInOutcome?: CalculatedProfitLoss) => void): void {
  getUserTradingHistory(db, null, account, marketId, outcome, null, null, null, null, null, null, null, (err: Error|null, userTradingHistory?: Array<UITrade>): void => {
    if (err) return callback(err);
    if (!userTradingHistory || !userTradingHistory.length) return callback(null, { realized: "0", unrealized: "0", position: "0", meanOpenPrice: "0", queued: "0" });
    db.first("price").from("outcomes").where({ marketId, outcome }).asCallback((err: Error|null, outcomesRow?: Partial<OutcomesRow<BigNumber>>): void => {
      if (err) return callback(err);
      if (!outcomesRow) return callback(null);
      const lastPrice = fixedPointToDecimal(new BigNumber(outcomesRow.price!, 10), numTicks).toFixed();
      callback(null, augur.trading.calculateProfitLoss({ trades: userTradingHistory || [], lastPrice }));
    });
  });
}

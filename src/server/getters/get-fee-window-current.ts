import * as Knex from "knex";
import { Address, AsyncCallback, FeeWindowRow, FeeWindowState, UIFeeWindowCurrent } from "../../types";
import { series } from "async";
import { BigNumber } from "bignumber.js";
import { groupByAndSum, sumBy } from "./database";
import { ZERO } from "../../constants";
import { getCurrentTime } from "../../blockchain/process-block";
import Augur from "augur.js";
import * as _ from "lodash";

interface StakeRows {
  participantContributions: ParticipantStake;
  participationTokens: BigNumber;
}

interface FeeWindowStakes {
  feeWindowEthFees: BigNumber;
  feeWindowRepStaked: BigNumber;
}
interface ParticipantStake {
  initial_report: BigNumber;
  crowdsourcer: BigNumber;
}

function fabricateFeeWindow(db: Knex, augur: Augur, universe: Address, callback: (err?: Error|null, result?: UIFeeWindowCurrent<string>|null) => void) {
  db("universes").first("universe").where({ universe }).asCallback((err, universeRow) => {
    if (err) return callback(err);
    if (universeRow == null) return callback(null, null);
    const feeWindowId = Math.floor(getCurrentTime() / augur.constants.CONTRACT_INTERVAL.DISPUTE_ROUND_DURATION_SECONDS);
    const startTime = feeWindowId * augur.constants.CONTRACT_INTERVAL.DISPUTE_ROUND_DURATION_SECONDS;
    const endTime = (feeWindowId + 1) * augur.constants.CONTRACT_INTERVAL.DISPUTE_ROUND_DURATION_SECONDS;
    callback(null, {
      feeWindow: null,
      feeWindowId,
      startTime,
      endTime,
      universe,
    });
  });
}

export function getFeeWindowCurrent(db: Knex, augur: Augur, universe: Address, reporter: Address|null, callback: (err?: Error|null, result?: UIFeeWindowCurrent<string>|null) => void): void {
  if (universe == null) return callback(new Error("Must provide universe"));
  const query = db.select(
    [
      "endTime",
      "feeWindow",
      "feeWindowId",
      "startTime",
      "universe",
    ]).first().from("fee_windows")
    .where("state", FeeWindowState.CURRENT)
    .where({ universe });
  query.asCallback((err: Error|null, feeWindowRow?: FeeWindowRow): void => {
    if (err) return callback(err);
    if (!feeWindowRow) return fabricateFeeWindow(db, augur, universe, callback);
    const participantQuery = db.select("type", "reporterBalance as amountStaked").from("all_participants")
      .where("feeWindow", feeWindowRow.feeWindow)
      .where("reporter", reporter);

    const participationTokenQuery = db.first([
      "participationToken.balance AS amountStaked",
    ]).from("fee_windows")
      .join("balances AS participationToken", function () {
        this
          .on("participationToken.token", db.raw("fee_windows.feeWindow"))
          .andOn("participationToken.owner", db.raw("?", [reporter]));
      })
      .where("fee_windows.feeWindow", feeWindowRow.feeWindow);

    const feeWindowEthFeesQuery = db("balances").first("balance")
      .where("owner", feeWindowRow.feeWindow)
      .where("token", augur.contracts.addresses[augur.rpc.getNetworkID()].Cash);

    const feeWindowRepStakedQuery = db("token_supply").first("supply")
      .join("fee_windows", "token_supply.token", "fee_windows.feeToken")
      .where("fee_windows.feeWindow", feeWindowRow.feeWindow);

    series({
      feeWindowEthFees: (next: AsyncCallback) => {
        feeWindowEthFeesQuery.asCallback((err: Error|null, results?: { balance: BigNumber }) => {
          if (err || results == null) return next(err, ZERO);
          next(null, results.balance);
        });
      },
      feeWindowRepStaked: (next: AsyncCallback) => {
        feeWindowRepStakedQuery.asCallback((err: Error|null, results?: { supply: BigNumber }) => {
          if (err || results == null) return next(err, ZERO);
          next(null, results.supply);
        });
      },
    }, (err: Error|null, stakes: FeeWindowStakes): void => {
      if (err) return callback(err);
      const feeWindowResponse = Object.assign({
        feeWindowEthFees: stakes.feeWindowEthFees.toFixed(),
        feeWindowRepStaked: stakes.feeWindowRepStaked.toFixed(),
      }, feeWindowRow);
      if (reporter == null) {
        return callback(null, feeWindowResponse);
      }
      series({
        participantContributions: (next: AsyncCallback) => {
          participantQuery.asCallback((err: Error|null, results?: Array<{ amountStaked: BigNumber; type: string }>) => {
            if (err || results == null) return next(err);
            const pick = _.keyBy(groupByAndSum(results, ["type"], ["amountStaked"]), "type");
            next(null, {
              initial_report: pick.initial_report ? pick.initial_report.amountStaked : ZERO,
              crowdsourcer: pick.crowdsourcer ? pick.crowdsourcer.amountStaked : ZERO,
            });
          });
        },
        participationTokens: (next: AsyncCallback) => {
          participationTokenQuery.asCallback((err: Error|null, results?: { amountStaked: BigNumber }) => {
            if (err || results == null) return next(err, ZERO);
            next(null, results.amountStaked);
          });
        },
      }, (err: Error|null, stakes: StakeRows): void => {
        if (err) return callback(err);
        const totalParticipantContributions = stakes.participantContributions.crowdsourcer.plus(stakes.participantContributions.initial_report);
        const totalStake = totalParticipantContributions.plus((stakes.participationTokens));
        callback(null, Object.assign(
          {
            totalStake: totalStake.toFixed(),
            participantContributions: totalParticipantContributions.toFixed(),
            participantContributionsInitialReport: stakes.participantContributions.initial_report.toFixed(),
            participantContributionsCrowdsourcer: stakes.participantContributions.crowdsourcer.toFixed(),
            participationTokens: stakes.participationTokens.toFixed(),
          }, feeWindowResponse,
        ));
      });
    });
  });
}

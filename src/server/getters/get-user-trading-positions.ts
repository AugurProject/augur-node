import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { BigNumber } from "bignumber.js";
import Augur from "augur.js";
import { ZERO } from "../../constants";
import { Address, OutcomeParam, SortLimitParams } from "../../types";
import { getAllOutcomesProfitLoss, ProfitLossResult, sumProfitLossResults } from "./get-profit-loss";

export const UserTradingPositionsParamsSpecific = t.type({
  universe: t.union([t.string, t.null, t.undefined]),
  marketId: t.union([t.string, t.null, t.undefined]),
  account: t.union([t.string, t.null, t.undefined]),
  outcome: t.union([OutcomeParam, t.number, t.null, t.undefined]),
});

export const UserTradingPositionsParams = t.intersection([
  UserTradingPositionsParamsSpecific,
  SortLimitParams,
  t.partial({
    endTime: t.number,
  }),
]);

interface TradingPosition extends ProfitLossResult {
  marketId: string;
}

async function queryUniverse(db: Knex, marketId: Address): Promise<Address> {
  const market = await db
    .first("universe")
    .from("markets")
    .where({ marketId });
  if (!market || market.universe == null) throw new Error("If universe isn't provided, you must provide a valid marketId");
  return market.universe;
}

export async function getUserTradingPositions(db: Knex, augur: Augur, params: t.TypeOf<typeof UserTradingPositionsParams>): Promise<Array<TradingPosition>> {
  if (params.universe == null && params.marketId == null) throw new Error("Must provide reference to universe, specify universe or marketId");
  if (params.account == null) throw new Error("Missing required parameter: account");

  const endTime = params.endTime || Date.now() / 1000;
  const universeId = params.universe || (await queryUniverse(db, params.marketId!));
  const { profit: profitsPerMarket, marketOutcomes: numOutcomesByMarket } = await getAllOutcomesProfitLoss(db, augur, {
    universe: universeId,
    account: params.account,
    marketId: params.marketId || null,
    startTime: 0,
    endTime,
    periodInterval: endTime,
  });

  if (_.isEmpty(profitsPerMarket)) return [];

  const positions = _.flatten(_.map(profitsPerMarket, (outcomePls: Array<Array<ProfitLossResult>>, marketId: string) => {
    const lastTimestampPls = _.last(outcomePls)!;
    const numOutcomes = numOutcomesByMarket[marketId];
    // For display purposes only we want 2 outcome markets to sum their realized profit since we hide the other outcome's information
    if (numOutcomes !== 2 || lastTimestampPls.length < 2) return lastTimestampPls;
    const totalRealized = lastTimestampPls[0].realized.plus(lastTimestampPls[1].realized);
    lastTimestampPls[0].realized = totalRealized;
    lastTimestampPls[1].realized = totalRealized;
    return lastTimestampPls;
  }));

  if (params.outcome === null || typeof params.outcome === "undefined") return positions;

  return _.filter(positions, { outcome: params.outcome });
}

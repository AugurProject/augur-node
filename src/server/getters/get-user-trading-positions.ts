import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { BigNumber } from "bignumber.js";
import Augur from "augur.js";
import { ZERO } from "../../constants";
import { Address, OutcomeParam, SortLimitParams } from "../../types";
import { getAllOutcomesProfitLoss, ProfitLossResult } from "./get-profit-loss";
import { numTicksToTickSize } from "./../../utils/convert-fixed-point-to-decimal";

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
  position: string;
}

interface RawPosition {
  marketId: string;
  outcome: number;
  balance: BigNumber;
  maxPrice: BigNumber;
  minPrice: BigNumber;
  numTicks: BigNumber;
  seen: boolean;
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
  const { profit: profitsPerMarket } = await getAllOutcomesProfitLoss(db, {
    universe: universeId,
    account: params.account,
    marketId: params.marketId || null,
    startTime: 0,
    endTime,
    periodInterval: endTime,
  });

  const rawPositionsQuery = db
    .select(["tokens.marketId", "tokens.outcome", "balances.balance", "markets.maxPrice", "markets.minPrice", "markets.numticks"])
    .from("balances")
    .innerJoin("tokens", "tokens.contractAddress", "balances.token")
    .innerJoin("markets", "tokens.marketId", "markets.marketId")
    .whereNotNull("tokens.marketId")
    .whereNotNull("tokens.outcome")
    .andWhere("balances.owner", params.account)
    .andWhere("markets.universe", universeId);

  if (params.marketId) rawPositionsQuery.andWhere("markets.marketId", params.marketId);

  const rawPositions: Array<RawPosition> = await rawPositionsQuery;

  const rawPositionsMapping: {[key: string]: RawPosition} = _.reduce(rawPositions, (result, rawPosition) => {
    const key = rawPosition.marketId.concat(rawPosition.outcome.toString());
    const tickSize = numTicksToTickSize(rawPosition.numTicks, rawPosition.minPrice, rawPosition.maxPrice);
    rawPosition.balance = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(rawPosition.balance, 10), tickSize);
    result[key] = rawPosition;
    return result;
  }, {} as {[key: string]: RawPosition});

  const marketToLargestShort: {[key: string]: BigNumber} = {};

  let positions = _.flatten(_.map(profitsPerMarket, (outcomePls: Array<Array<ProfitLossResult>>) => {
    const lastTimestampPls = _.last(outcomePls)!;
    return _.map(lastTimestampPls, (plr) => {
      const key = plr.marketId.concat(plr.outcome.toString());
      const rawPosition = rawPositionsMapping[key];
      let position = "0";
      marketToLargestShort[plr.marketId] = BigNumber.min(marketToLargestShort[plr.marketId] || ZERO, plr.netPosition);
      if (rawPosition) {
        rawPositionsMapping[key].seen = true;
        position = rawPosition.balance.toString();
      }
      return Object.assign(
        { position },
        plr,
      ) as TradingPosition;
    });
  }));

  // Show outcomes with just a raw position if they have some quantity not accounted for via trades (e.g manual transfers)
  const rawPositionOnlyToShow = _.filter(rawPositionsMapping, (rawPosition) => {
    const largestShort = marketToLargestShort[rawPosition.marketId];
    return !rawPosition.seen && largestShort.abs().lt(rawPosition.balance);
  });

  const noPLPositions = _.map(rawPositionOnlyToShow, (rawPosition) => {
    return {
      position: rawPosition.balance.toString(),
      marketId: rawPosition.marketId,
      outcome: rawPosition.outcome,
      netPosition: ZERO,
      averagePrice: ZERO,
      realized: ZERO,
      unrealized: ZERO,
      timestamp: 0,
    } as TradingPosition;
  });

  positions = positions.concat(noPLPositions);

  if (params.outcome === null || typeof params.outcome === "undefined") return positions;

  return _.filter(positions, { outcome: params.outcome });
}

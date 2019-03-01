import Augur from "augur.js";
import { BigNumber } from "bignumber.js";
import * as t from "io-ts";
import * as Knex from "knex";
import * as _ from "lodash";
import { FrozenFunds } from "../../blockchain/log-processors/profit-loss/frozen-funds";
import { ZERO, BN_WEI_PER_ETHER } from "../../constants";
import { Address, OutcomeParam, SortLimitParams, MarketsRow, ReportingState } from "../../types";
import { numTicksToTickSize, fixedPointToDecimal } from "../../utils/convert-fixed-point-to-decimal";
import { getAllOutcomesProfitLoss, ProfitLossResult } from "./get-profit-loss";

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

// TODO doc per outcome
export interface TradingPosition extends ProfitLossResult, FrozenFunds {
  position: string;
}

// TODO doc
export interface MarketTradingPosition extends Pick<ProfitLossResult,
"timestamp" | "marketId" | "realized" | "unrealized" | "total" | "realizedPercent" |
"unrealizedPercent" | "totalPercent" | "currentValue"
>, FrozenFunds {}

export interface GetUserTradingPositionsResponse {
  tradingPositions: Array<TradingPosition>; // TODO doc
  tradingPositionsPerMarket: { // TODO doc
    [marketId: string]: MarketTradingPosition,
  };
  frozenFundsTotal: FrozenFunds; // User's total frozen funds. See docs on FrozenFunds. This total includes market validity bonds in addition to sum of frozen funds for all market outcomes in which user has a position.
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

export async function getUserTradingPositions(db: Knex, augur: Augur, params: t.TypeOf<typeof UserTradingPositionsParams>): Promise<GetUserTradingPositionsResponse> {
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

  const getSumOfMarketValidityBondsPromise = getEthEscrowedInValidityBonds(db, params.account); // do this here so that awaits are concurrent

  const rawPositions: Array<RawPosition> = await rawPositionsQuery;

  const rawPositionsMapping: { [key: string]: RawPosition } = _.reduce(rawPositions, (result, rawPosition) => {
    const key = rawPosition.marketId.concat(rawPosition.outcome.toString());
    const tickSize = numTicksToTickSize(rawPosition.numTicks, rawPosition.minPrice, rawPosition.maxPrice);
    rawPosition.balance = augur.utils.convertOnChainAmountToDisplayAmount(new BigNumber(rawPosition.balance, 10), tickSize);
    result[key] = rawPosition;
    return result;
  }, {} as { [key: string]: RawPosition });

  const marketToLargestShort: { [key: string]: BigNumber } = {};

  let positions: Array<TradingPosition> = _.flatten(_.map(profitsPerMarket, (outcomePls: Array<Array<ProfitLossResult>>) => {
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
      );
    });
  }));

  // Show outcomes with just a raw position if they have some quantity not accounted for via trades (e.g manual transfers)
  const rawPositionOnlyToShow = _.filter(rawPositionsMapping, (rawPosition) => {
    const largestShort = marketToLargestShort[rawPosition.marketId];
    return !rawPosition.seen && largestShort && largestShort.abs().lt(rawPosition.balance);
  });

  const noPLPositions: Array<TradingPosition> = _.map(rawPositionOnlyToShow, (rawPosition) => {
    return {
      position: rawPosition.balance.toString(),
      marketId: rawPosition.marketId,
      outcome: rawPosition.outcome,
      netPosition: ZERO,
      averagePrice: ZERO,
      realized: ZERO,
      unrealized: ZERO,
      total: ZERO,
      timestamp: 0,
      realizedPercent: ZERO,
      unrealizedPercent: ZERO,
      totalPercent: ZERO,
      currentValue: ZERO, // TODO ??
      frozenFunds: ZERO,
    };
  });

  positions = positions.concat(noPLPositions);

  if (params.outcome !== null && typeof params.outcome !== "undefined") {
    positions = _.filter(positions, { outcome: params.outcome });
  }

  const frozenFundsTotal: FrozenFunds = {
    frozenFunds: positions.reduce<BigNumber>((sum: BigNumber, p: TradingPosition) => sum.plus(p.frozenFunds), ZERO),
  };

  // By our business definition, a user's total frozen funds
  // includes their market validity bonds. (Validity bonds are
  // paid in ETH and are escrowed until the markets resolve valid.)
  frozenFundsTotal.frozenFunds = frozenFundsTotal.frozenFunds.plus(await getSumOfMarketValidityBondsPromise);

  return {
    tradingPositions: positions,
    tradingPositionsPerMarket: {
      "0x1000000000000000000000000000000000000001": {
        timestamp: 1551467992,
        realized: ZERO,
        unrealized: ZERO,
        total: ZERO,
        marketId: "0x1000000000000000000000000000000000000001",
        realizedPercent: ZERO,
        unrealizedPercent: ZERO,
        totalPercent: ZERO,
        currentValue: ZERO,
        frozenFunds: ZERO,
      },
      "0x0000000000000000000000000000000000000002": {
        timestamp: 1551467992,
        realized: ZERO,
        unrealized: ZERO,
        total: ZERO,
        marketId: "0x0000000000000000000000000000000000000002",
        realizedPercent: ZERO,
        unrealizedPercent: ZERO,
        totalPercent: ZERO,
        currentValue: ZERO,
        frozenFunds: ZERO,
      },
    },
    frozenFundsTotal,
  };
}

// getEthEscrowedInValidityBonds returns the sum of all market validity bonds for
// non-finalized markets created by the passed marketCreator. Ie. how much ETH
// this creator has escrowed in validity bonds. Denominated in Eth (whole tokens).
async function getEthEscrowedInValidityBonds(db: Knex, marketCreator: Address): Promise<BigNumber> {
  const marketsRow: Array<Pick<MarketsRow<BigNumber>, "validityBondSize"> > = await db.select("validityBondSize", "reportingState").from("markets")
    .leftJoin("market_state", "markets.marketStateId", "market_state.marketStateId")
    .whereNot({ reportingState: ReportingState.FINALIZED })
    .where({ marketCreator });
  let totalValidityBonds = ZERO;
  for (const market of marketsRow) {
    // market.validityBondSize is in attoETH and totalValidityBonds is in ETH
    totalValidityBonds = totalValidityBonds.plus(
      fixedPointToDecimal(market.validityBondSize, BN_WEI_PER_ETHER));
  }
  return totalValidityBonds;
}

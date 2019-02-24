import { BigNumber } from "bignumber.js";
import { ZERO } from "../../../constants";
import { TradesRow } from "../../../types";

// FrozenFunds in some context, eg. for one market outcome or a user's entire account.
// TODO doc what are frozen funds
export interface FrozenFunds {
  // TODO doc
  frozenFunds: BigNumber;
  frozenProfit: BigNumber;
}

// FrozenFundsEvent are the types of events whose processing requires
// updating a market outcome's frozen funds. Frozen funds are most
// granularly tracked by (market, outcome). Ie. one FrozenFunds
// per outcome, stored in wcl_profit_loss_timeseries DB table. An
// outcome's frozen funds must be updated in response to each event.
export type FrozenFundsEvent = Trade | ClaimProceeds;

// ClaimProceeds is a type of FrozenFundsEvent corresponding to a user
// claiming their proceeds (winnings) in a market. Since FrozenFunds
// is tracked and updated per outcome, ClaimProceeds must be processed
// for every outcome on a market when a user claims their winnings for
// that market. In practical terms, the user claims their winnings which
// makes them have zero frozen funds for all outcomes in this market.
type ClaimProceeds = "ClaimProceeds";

// Trade is a type of FrozenFundsEvent corresponding to the user
// executing a trade on a specific market outcome. An outcome's frozen
// funds may increase or decrease depending on the details of the trade.
interface Trade {
  creatorOrFiller: "creator" | "filler"; // "creator" if the user was the creator of the Order to which this Trade belongs. "filler" if the user filled another creator's Order
  realizedProfit: BigNumber; // denominated in tokens (eg. ETH). Profit which the user realized by executing this trade
  tradeData: Pick<TradesRow<BigNumber>, "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares">; // data associated with this Trade which is required to compute the next FrozenFunds
}

interface FrozenFundsParams {
  frozenFundsBeforeEvent: FrozenFunds; // FrozenFunds prior to processing this FrozenFundsEvent
  event: FrozenFundsEvent; // FrozenFundsEvent to process and return updated FrozenFunds as impacted by this event
}

// TODO doc - frozen funds in context of one (market, outcome)
// TODO unit test
export function getFrozenFundsAfterEventForOneOutcome(params: FrozenFundsParams): FrozenFunds {
  if (params.event === "ClaimProceeds") {
    return {
      // TODO doc
      frozenFunds: ZERO,
      frozenProfit: ZERO,
    };
  }
  // params.event is a trade executed; TODO break each event into a separate function
  const trade = params.event.tradeData;
  const frozenFundsAfterEvent = Object.assign({}, params.frozenFundsBeforeEvent);

  // TODO make this into a helper
  /*
  function getTokensForDestroyedSharesForTrade(): {
    creatorTokens: BigNumber,
    fillerTokens: BigNumber,
  } {
    return {
      creatorTokens: ZERO,
      fillerTokens: ZERO,
    };
  }
  */
  const tokensFreedFromEscrowByThisTrade = BigNumber.min(trade.numCreatorShares, trade.numFillerShares).multipliedBy(ZERO /* TODO displayRange */);

  // TODO Alex - can you confirm formula for this:
  const creatorPortionOfTokensFreedFromEscrow = tokensFreedFromEscrowByThisTrade; // TODO actual value I think is f(minPrice, maxPrice, price)?
  const fillerPortionOfTokensFreedFromEscrow = tokensFreedFromEscrowByThisTrade; // TODO actual value I think is f(minPrice, maxPrice, price)?

  if (params.event.creatorOrFiller === "creator") {
    // I created this trade
    // TODO doc formulas
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.minus(creatorPortionOfTokensFreedFromEscrow);
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.plus(trade.numCreatorTokens);
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.minus(trade.numFillerTokens);
  } else {
    // I filled this trade
    // TODO doc formulas
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.minus(fillerPortionOfTokensFreedFromEscrow);
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.plus(trade.numFillerTokens);
    frozenFundsAfterEvent.frozenFunds = frozenFundsAfterEvent.frozenFunds.minus(trade.numCreatorTokens);
  }

  if (frozenFundsAfterEvent.frozenFunds.isGreaterThanOrEqualTo(
    params.frozenFundsBeforeEvent.frozenFunds)) {
    // frozen funds increased or stayed the same, so my available funds decreased or
    // stayed the same, which means that my frozen profit should increase by realized
    // profit and loss for this trade. Ie. frozen profit is profit that I could claim,
    // but haven't, and we detect this by looking for a non-increase in available funds.
    // TODO Alex - is this right?
    frozenFundsAfterEvent.frozenProfit = frozenFundsAfterEvent.frozenProfit.plus(params.event.realizedProfit);
  }

  return frozenFundsAfterEvent;
}

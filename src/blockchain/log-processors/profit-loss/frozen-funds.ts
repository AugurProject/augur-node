import { BigNumber } from "bignumber.js";
import { ZERO } from "../../../constants";
import { MarketsRow, TradesRow } from "../../../types";

// FrozenFunds in some context, eg. for one market outcome or a user's entire account.
// TODO doc what are frozen funds
export interface FrozenFunds {
  // TODO doc
  frozenFunds: BigNumber;
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
interface Trade extends
  Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice">, // TODO doc
  Pick<TradesRow<BigNumber>, "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares"> { // data associated with this Trade which is required to compute the next FrozenFunds
  longOrShort: "long" | "short"; // "long" if the user was long on this trade (ie. created a buy order, or filled a sell order). "short" if user was short on this trade (ie. created a sell order, or filled a buy order)
  creatorOrFiller: "creator" | "filler"; // "creator" if the user was the creator of the Order to which this Trade belongs. "filler" if the user filled another creator's Order
  realizedProfit: BigNumber; // denominated in tokens (eg. ETH). Profit which the user realized by executing this trade
}

interface FrozenFundsParams {
  frozenFundsBeforeEvent: FrozenFunds; // FrozenFunds prior to processing this FrozenFundsEvent
  event: FrozenFundsEvent; // FrozenFundsEvent to process and return updated FrozenFunds as impacted by this event
}

// TODO doc - frozen funds in context of one (market, outcome)
// TODO unit test and auto test symmetry of creator/filler short/long
export function getFrozenFundsAfterEventForOneOutcome(params: FrozenFundsParams): FrozenFunds {
  if (params.event === "ClaimProceeds") {
    return {
      // TODO doc
      frozenFunds: ZERO,
    };
  }
  // params.event is a Trade executed by this user
  const trade = params.event;
  let frozenFundsAfterEvent = params.frozenFundsBeforeEvent.frozenFunds;

  // TODO doc
  const myTokensSent = trade.creatorOrFiller === "creator" ? trade.numCreatorTokens : trade.numFillerTokens;
  const mySharesSent = trade.creatorOrFiller === "creator" ? trade.numCreatorShares : trade.numFillerShares;
  const tokensReceivedPrice = trade.longOrShort === "long" ? trade.price : trade.maxPrice.minus(trade.price);
  const myTokensReceived = mySharesSent.multipliedBy(tokensReceivedPrice);

  // TODO doc
  frozenFundsAfterEvent = frozenFundsAfterEvent.minus(myTokensReceived);
  frozenFundsAfterEvent = frozenFundsAfterEvent.plus(myTokensSent);

  if (frozenFundsAfterEvent.isGreaterThanOrEqualTo(
    params.frozenFundsBeforeEvent.frozenFunds)) {
    // Frozen profit is profit or loss which is not available in the user's funds
    // as it only applied in the context of adjusting the entry into a new position.
    // It's not profit that you could claim but haven't, that's _unrealized_ profit.
    frozenFundsAfterEvent = frozenFundsAfterEvent.plus(trade.realizedProfit);
  }

  return {
    frozenFunds: frozenFundsAfterEvent,
  };
}

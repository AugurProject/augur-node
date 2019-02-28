import { BigNumber } from "bignumber.js";
import { ZERO } from "../../../constants";
import { MarketsRow, TradesRow } from "../../../types";

// Frozen funds are tokens that a user has given up (locked in escrow
// or given to a counterparty) to obtain their current position. Frozen
// funds is tracked separately per market outcome. Frozen funds can also
// be provided as an aggregation (eg. GetUserTradingPositionsResponse)
// in which case this interface provides data structure standardization.
export interface FrozenFunds {
  frozenFunds: BigNumber; // in whole tokens (eg. ETH)
}

// FrozenFundsEvent are the types of events whose processing requires updating
// a market outcome's frozen funds. Frozen funds tracked by (market, outcome).
// Ie. one FrozenFunds per outcome, stored in wcl_profit_loss_timeseries DB
// table. An outcome's frozen funds must be updated in response to each event.
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
export interface Trade extends
  Pick<MarketsRow<BigNumber>, "minPrice" | "maxPrice">, // from market to which this trade belongs
  Pick<TradesRow<BigNumber>, "price" | "numCreatorTokens" | "numCreatorShares" | "numFillerTokens" | "numFillerShares"> { // data associated with this Trade
  longOrShort: "long" | "short"; // "long" if the user was long on this trade (ie. created a buy order, or filled a sell order). "short" if user was short on this trade (ie. created a sell order, or filled a buy order)
  creatorOrFiller: "creator" | "filler"; // "creator" if the user was the creator of the Order to which this Trade belongs. "filler" if the user filled another creator's Order
  realizedProfitDelta: BigNumber; // denominated in tokens (eg. ETH). Profit which the user realized by executing this trade
}

export interface FrozenFundsParams {
  frozenFundsBeforeEvent: FrozenFunds; // FrozenFunds prior to processing this FrozenFundsEvent
  event: FrozenFundsEvent; // FrozenFundsEvent to process and return updated FrozenFunds as impacted by this event
}

// getFrozenFundsAfterEventForOneOutcome computes the next frozen funds for
// a market outcome, using the passed current frozen funds and event causing
// the frozen funds to be updated. getFrozenFundsAfterEventForOneOutcome owns
// the authoritative business definition of how frozen funds are calculated.
export function getFrozenFundsAfterEventForOneOutcome(params: FrozenFundsParams): FrozenFunds {
  if (params.event === "ClaimProceeds") {
    return {
      // When a user claims market proceeds, they are (by
      // definition) withdrawing to their wallet all tokens they have
      // escrowed in this market, so we set frozen funds to zero.
      frozenFunds: ZERO,
    };
  }

  // params.event is a Trade executed by this user
  const trade = params.event;
  let frozenFundsAfterEvent = params.frozenFundsBeforeEvent.frozenFunds;

  // Idea here is that frozen funds are defined by tokens
  // sent/received, so we have to transform trade details into
  // the actual quantity of tokens the user sent or received.
  const mySharesSent = trade.creatorOrFiller === "creator" ? trade.numCreatorShares : trade.numFillerShares;
  const priceReceivedForMySharesSent = trade.longOrShort === "short" ? trade.price.minus(trade.minPrice) : trade.maxPrice.minus(trade.price);
  const myTokensReceived = mySharesSent.multipliedBy(priceReceivedForMySharesSent);
  const myTokensSent = trade.creatorOrFiller === "creator" ? trade.numCreatorTokens : trade.numFillerTokens;

  // Tokens received are subtracted from frozen funds because the
  // user now possesses those funds, and thus those funds are no longer
  // "frozen". Similarly, tokens sent are added to frozen funds.
  frozenFundsAfterEvent = frozenFundsAfterEvent.minus(myTokensReceived);
  frozenFundsAfterEvent = frozenFundsAfterEvent.plus(myTokensSent);

  // Frozen profit is profit or loss which is not available in the user's funds
  // as it only applied in the context of adjusting the entry into a new position.
  // It's not profit that you could claim but haven't, that's _unrealized_ profit.
  // As an example of why realizedProfit must be added to frozen funds, imagine
  // the user bought X shares for 10 tokens, and then sold those shares for 15
  // tokens, at a profit of 5 tokens. Without including profit in the frozen funds
  // calculation, the user would have -5 frozen funds (10 tokens out, 15 tokens in);
  // we must include the profit to reach the correct frozen funds value of zero.
  frozenFundsAfterEvent = frozenFundsAfterEvent.plus(trade.realizedProfitDelta);

  return {
    frozenFunds: frozenFundsAfterEvent,
  };
}

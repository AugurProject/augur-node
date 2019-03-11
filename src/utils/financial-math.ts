import { BigNumber } from "bignumber.js";
import { Tokens, Shares, Price } from "./dimension-quantity";

const ZERO = new BigNumber(0);
const ZERO_SHARES = new Shares(ZERO);

// TODO unit test
// TODO doc
export function getQuantityClosedFromTrade(prevPosition: Shares, positionDeltaFromTrade: Shares): Shares {
  if (positionDeltaFromTrade.isZero() || prevPosition.sign === positionDeltaFromTrade.sign) {
    return ZERO_SHARES;
  }
  return prevPosition.abs().min(positionDeltaFromTrade.abs());
}

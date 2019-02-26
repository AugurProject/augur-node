
import BigNumber from "bignumber.js";
import { cloneDeep } from "lodash";
import { FrozenFunds, FrozenFundsParams, getFrozenFundsAfterEventForOneOutcome, Trade } from "../../../../../src/blockchain/log-processors/profit-loss/frozen-funds";
import { ZERO } from "../../../../../src/constants";

const A = new BigNumber(1337);
const B = new BigNumber(29);

function bn(n: number): BigNumber {
  return new BigNumber(n, 10);
}

interface TestCase extends FrozenFundsParams {
  name: string;
  expectedFrozenFunds: FrozenFunds;
}

const testClaims: Array<TestCase> = [
  {
    name: "ClaimProceeds keeps frozen funds to zero",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: "ClaimProceeds",
    expectedFrozenFunds: {
      frozenFunds: ZERO,
    },
  },
  {
    name: "ClaimProceeds sets frozen funds to zero",
    frozenFundsBeforeEvent: {
      frozenFunds: A,
    },
    event: "ClaimProceeds",
    expectedFrozenFunds: {
      frozenFunds: ZERO,
    },
  },
];

const testTrades: Array<TestCase> = [
  {
    name: "creator just creating complete sets with frozen profit",
    frozenFundsBeforeEvent: {
      frozenFunds: A,
    },
    event: {
      minPrice: bn(-10),
      maxPrice: bn(30),
      price: bn(22.5),
      numCreatorTokens: bn(123),
      numCreatorShares: ZERO,
      numFillerTokens: bn(57),
      numFillerShares: ZERO,
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfit: B,
    },
    expectedFrozenFunds: {
      frozenFunds: A.plus(bn(123)).plus(B),
    },
  },
  {
    name: "filler just creating complete sets with frozen profit",
    frozenFundsBeforeEvent: {
      frozenFunds: A,
    },
    event: {
      minPrice: bn(-10),
      maxPrice: bn(30),
      price: bn(22.5),
      numCreatorTokens: bn(123),
      numCreatorShares: ZERO,
      numFillerTokens: bn(57),
      numFillerShares: ZERO,
      longOrShort: "long",
      creatorOrFiller: "filler",
      realizedProfit: B,
    },
    expectedFrozenFunds: {
      frozenFunds: A.plus(bn(57)).plus(B),
    },
  },
  {
    name: "creator just destroying complete sets",
    frozenFundsBeforeEvent: {
      frozenFunds: B,
    },
    event: {
      minPrice: bn(-10),
      maxPrice: bn(30),
      price: bn(29),
      numCreatorTokens: ZERO,
      numCreatorShares: bn(372),
      numFillerTokens: ZERO,
      numFillerShares: bn(483),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfit: bn(5),
    },
    expectedFrozenFunds: {
      frozenFunds: B.minus(bn(372).multipliedBy(bn(29))),
    },
  },
  {
    name: "filler just destroying complete sets",
    frozenFundsBeforeEvent: {
      frozenFunds: B,
    },
    event: {
      minPrice: bn(-10),
      maxPrice: bn(30),
      price: bn(29),
      numCreatorTokens: ZERO,
      numCreatorShares: bn(372),
      numFillerTokens: ZERO,
      numFillerShares: bn(483),
      longOrShort: "short",
      creatorOrFiller: "filler",
      realizedProfit: bn(12),
    },
    expectedFrozenFunds: {
      frozenFunds: B.minus(bn(483).multipliedBy(bn(1))),
    },
  },
  {
    name: "creator position reversal",
    frozenFundsBeforeEvent: {
      frozenFunds: B,
    },
    event: {
      minPrice: bn(-1.5),
      maxPrice: bn(2),
      price: bn(1.4),
      numCreatorTokens: bn(48),
      numCreatorShares: bn(372),
      numFillerTokens: bn(72),
      numFillerShares: bn(483),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfit: bn(5),
    },
    expectedFrozenFunds: {
      frozenFunds: B.plus(bn(48)).minus(bn(372).multipliedBy(bn(0.6))),
    },
  },
  {
    name: "filler position reversal",
    frozenFundsBeforeEvent: {
      frozenFunds: B,
    },
    event: {
      minPrice: bn(-1.5),
      maxPrice: bn(2),
      price: bn(1.4),
      numCreatorTokens: bn(48),
      numCreatorShares: bn(372),
      numFillerTokens: bn(72),
      numFillerShares: bn(483),
      longOrShort: "long",
      creatorOrFiller: "filler",
      realizedProfit: bn(5),
    },
    expectedFrozenFunds: {
      frozenFunds: B.plus(bn(72)).minus(bn(483).multipliedBy(bn(1.4))),
    },
  },
  // append test cases here as needed
];

const testData: Array<TestCase> = [
  ...testClaims,
  ...testTrades,

  // Autogenerate test cases to ensure algorithm correctly handles
  // dual of each trade. Each trade has a natural dual/symmetric
  // opposite: a creator who was long could instead be a filler that
  // was short (given symmetric price, share, and token amounts).
  ...testTrades.map((tc) => {
    const tc2 = cloneDeep(tc);
    tc2.name = "auto-generated dual of: " + tc.name;
    const trade = tc2.event as Trade;
    trade.price = trade.maxPrice.minus(trade.price);
    trade.longOrShort = trade.longOrShort === "long" ? "short" : "long";
    trade.creatorOrFiller = trade.creatorOrFiller === "creator" ? "filler" : "creator";
    let tmp: BigNumber = trade.numCreatorShares;
    trade.numCreatorShares = trade.numFillerShares;
    trade.numFillerShares = tmp;
    tmp = trade.numCreatorTokens;
    trade.numCreatorTokens = trade.numFillerTokens;
    trade.numFillerTokens = tmp;
    return tc2;
  }),
];

testData.forEach((tc) => {
  test(tc.name, () => {
    expect(getFrozenFundsAfterEventForOneOutcome(tc)
      .frozenFunds).toEqual(tc.expectedFrozenFunds.frozenFunds);
  });
});

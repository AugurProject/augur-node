
import BigNumber from "bignumber.js";
import { cloneDeep } from "lodash";
import { FrozenFunds, FrozenFundsParams, getFrozenFundsAfterEventForOneOutcome, Trade } from "../../../../../src/blockchain/log-processors/profit-loss/frozen-funds";
import { ZERO } from "../../../../../src/constants";

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
      frozenFunds: bn(29),
    },
    event: "ClaimProceeds",
    expectedFrozenFunds: {
      frozenFunds: ZERO,
    },
  },
];

const testTrades: Array<TestCase> = [
  {
    name: "Binary State 1",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.65),
      numCreatorTokens: bn(3.5),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(3.5),
    },
  },
  // skip Binary State 2 which is a price change
  {
    name: "Binary State 3",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(3.5),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.58),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(3),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0.21),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(2.45),
    },
  },
  // skip Binary State 4 which is a price change
  {
    name: "Binary State 5",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(2.45),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.62),
      numCreatorTokens: bn(4.94),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(7.39),
    },
  },
  {
    name: "Binary State 6",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(7.39),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.5),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(10),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(1.515 - 0.21),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(3.695),
    },
  },
  // skip Binary State 7 which is a price change
  {
    name: "Binary State 8",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(3.695),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.15),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(7),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(4.8785 - 1.515),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(1.1085),
    },
  },
  {
    name: "Cat3-Tr1 State 1",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.4),
      numCreatorTokens: bn(0.4),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(0.4),
    },
  },
  {
    name: "Cat3-Tr1 State 2",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.2),
      numCreatorTokens: bn(1.6),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(1.6),
    },
  },
  {
    name: "Cat3-Tr1 State 3",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.3),
      numCreatorTokens: bn(0.15),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(0.15),
    },
  },
  // skip "Cat3-Tr1 State 4" which is a price change
  {
    name: "Cat3-Tr1 State 5",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(0.4),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.7),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(1),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0.3),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(0),
    },
  },
  {
    name: "Cat3-Tr2 State 1",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.4),
      numCreatorTokens: bn(3),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(3),
    },
  },
  {
    name: "Cat3-Tr2 State 2",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.35),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(3),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(-1.05),
    },
  },
  {
    name: "Cat3-Tr2 State 3",
    frozenFundsBeforeEvent: {
      frozenFunds: ZERO,
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.3),
      numCreatorTokens: bn(3.5),
      numCreatorShares: bn(5),
      numFillerTokens: bn(3),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(2),
    },
  },
  {
    name: "Cat3-Tr2 State 4",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(2),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.1),
      numCreatorTokens: bn(0.3),
      numCreatorShares: bn(5),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(1.6),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(-0.6),
    },
  },
  {
    name: "Cat3-Tr3 State 1",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(0),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.15),
      numCreatorTokens: bn(1.5),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(1.5),
    },
  },
  {
    name: "Cat3-Tr3 State 2",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(0),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.1),
      numCreatorTokens: bn(2.5),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(2.5),
    },
  },
  {
    name: "Cat3-Tr3 State 3",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(0),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.6),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(5),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(-2),
    },
  },
  {
    name: "Cat3-Tr3 State 4",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(2.5),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.2),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(13),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(1.3),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(1.2),
    },
  },
  // skip Cat3-Tr3 State 5 which is price change
  {
    name: "Cat3-Tr3 State 6",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(-2),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.8),
      numCreatorTokens: bn(0.6),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0.6),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(-0.8),
    },
  },
  {
    name: "Cat3-Tr3 State 7",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(1.5),
    },
    event: {
      minPrice: bn(0),
      maxPrice: bn(1),
      price: bn(0.1),
      numCreatorTokens: bn(1.8),
      numCreatorShares: bn(8),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(-0.5),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(2),
    },
  },
  {
    name: "Scalar State 1",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(0),
    },
    event: {
      minPrice: bn(50),
      maxPrice: bn(250),
      price: bn(200),
      numCreatorTokens: bn(300),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(300),
    },
  },
  {
    name: "Scalar State 2",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(300),
    },
    event: {
      minPrice: bn(50),
      maxPrice: bn(250),
      price: bn(180),
      numCreatorTokens: bn(390),
      numCreatorShares: bn(0),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(0),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(690),
    },
  },
  // skip Scalar State 3 which is price change
  {
    name: "Scalar State 4",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(690),
    },
    event: {
      minPrice: bn(50),
      maxPrice: bn(250),
      price: bn(202),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(4),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(56),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(138),
    },
  },
  {
    name: "Scalar State 5",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(138),
    },
    event: {
      minPrice: bn(50),
      maxPrice: bn(250),
      price: bn(205),
      numCreatorTokens: bn(450),
      numCreatorShares: bn(1),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "short",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(73 - 56),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(450),
    },
  },
  // skip Scalar State 6 which is price change
  // skip Scalar State 7 which is price change
  {
    name: "Scalar State 8",
    frozenFundsBeforeEvent: {
      frozenFunds: bn(450),
    },
    event: {
      minPrice: bn(50),
      maxPrice: bn(250),
      price: bn(150),
      numCreatorTokens: bn(0),
      numCreatorShares: bn(7),
      numFillerTokens: bn(0),
      numFillerShares: bn(0),
      longOrShort: "long",
      creatorOrFiller: "creator",
      realizedProfitDelta: bn(458 - 73),
    },
    expectedFrozenFunds: {
      frozenFunds: bn(135),
    },
  },
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
    trade.price = trade.minPrice.plus(trade.maxPrice.minus(trade.price));
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

const { BigNumber } = require("bignumber.js");
const Augur = require("augur.js");
import { setupTestDb, seedDb } from "../test.database";
import { processOrderCreatedLog } from "src/blockchain/log-processors/order-created";
import { numTicksToTickSize } from "src/utils/convert-fixed-point-to-decimal";
import { checkMarketLiquidityUpdates } from "src/blockchain/check-market-liquidity-updates";


const augur = new Augur();

// function validate(testCase) {
//   function assertHas(prop) {
//     if (!testCase.hasOwnProperty(prop)) throw new Error(`expected test case to have property ${prop}, testCase=${testCase}`);
//   }
//   assertHas("name");
//   assertHas("marketId");
//   assertHas("logs");
//   assertHas("expectedSpreadPercentMarket");
//   assertHas("expectedSpreadPercentOutcome1"); // every testCase checks outcome 1, but only categoricals check [0, numOutcomes-1]
//   return testCase;
// }

// validateROI validates a testCase related to invalidROIPercent
function validateROI(testCase) {
  function assertHas(prop) {
    if (!testCase.hasOwnProperty(prop)) throw new Error(`expected test case to have property ${prop}, testCase=${testCase}`);
  }
  assertHas("name");
  assertHas("marketId");
  assertHas("logs");
  assertHas("expectedInvalidROIPercent");
  assertHas("expectedInvalidROIPercentOutcome1"); // every testCase checks outcome 1, but only categoricals check [0, numOutcomes-1]
  return testCase;
}

function bn(n) {
  return new BigNumber(n, 10);
}

const yesNoId = "0xfd9d2cab985b4e1052502c197d989fdf9e7d4b1e"; // marketId of a yesNo market in seeds/markets that has no seeds/orders. yesNo has reporting fee which is used in invalidROIPercent calculation
const scalarId = "0x0000000000000000000000000000000000000ff1"; // marketId of a scalar market in seeds/markets that has no seeds/orders; has minPrice=200, maxPrice=400. scalar has reporting fee which is used in invalidROIPercent calculation
const catId = "0x0000000000000000000000000000000000000015"; // marketId of a categorical market in seeds/markets that has no seeds/orders; has 4 outcomes. categorical has reporting fee which is used in invalidROIPercent calculation

// outcomesByMarketId is used to generate test cases only for
// outcomes that are actually used by a given market. It needs
// to be updated for any new marketIds used in this test.
const outcomesByMarketId = {
  // marketId --> Array<outcome numbers used by that marketId>
  [yesNoId]: [1],
  [scalarId]: [1],
  [catId]: [0, 1, 2, 3],
};

const testCases = [
  // validate({
  //   name: "categorical only - market spreadPercent is max of outcome spreadPercents - one outcome has empty book",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 0, orderType: "buy",  price: "0.2", amount: "0.1" },
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 1, orderType: "buy",  price: "0.2", amount: "0.1" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 2, orderType: "buy",  price: "0.2", amount: "0.1" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome0: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.6),
  //   expectedSpreadPercentOutcome2: bn(0.6),
  //   expectedSpreadPercentOutcome3: bn(1),
  // }),
  // validate({
  //   name: "categorical only - market spreadPercent is max of outcome spreadPercents - no empty books",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 0, orderType: "buy",  price: "0.2", amount: "0.1" },
  //     { outcome: 1, orderType: "sell", price: "0.95", amount: "0.1" },
  //     { outcome: 1, orderType: "buy",  price: "0.15", amount: "0.1" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 2, orderType: "buy",  price: "0.2", amount: "0.1" },
  //     { outcome: 3, orderType: "sell", price: "0.8", amount: "0.1" },
  //     { outcome: 3, orderType: "buy",  price: "0.2", amount: "0.1" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.8),
  //   expectedSpreadPercentOutcome0: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.8),
  //   expectedSpreadPercentOutcome2: bn(0.6),
  //   expectedSpreadPercentOutcome3: bn(0.6),
  // }),
  //
  // validate({
  //   name: "yesNo empty has spread of 100%",
  //   marketId: yesNoId,
  //   logs: [],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  // }),
  // validate({
  //   name: "categorical empty has spread of 100%",
  //   marketId: catId,
  //   logs: [],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome0: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  //   expectedSpreadPercentOutcome2: bn(1),
  //   expectedSpreadPercentOutcome3: bn(1),
  // }),
  // validate({
  //   name: "scalar empty has spread of 100%",
  //   marketId: scalarId,
  //   logs: [],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  // }),
  //
  // validate({
  //   name: "yesNo buy side empty so spread just uses other side",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.337", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.337),
  //   expectedSpreadPercentOutcome1: bn(0.337),
  // }),
  // validate({
  //   name: "categorical buy side empty so spread just uses other side",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.337", amount: "1337.75" },
  //     { outcome: 1, orderType: "sell", price: "0.337", amount: "1337.75" },
  //     { outcome: 2, orderType: "sell", price: "0.337", amount: "1337.75" },
  //     { outcome: 3, orderType: "sell", price: "0.337", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.337),
  //   expectedSpreadPercentOutcome0: bn(0.337),
  //   expectedSpreadPercentOutcome1: bn(0.337),
  //   expectedSpreadPercentOutcome2: bn(0.337),
  //   expectedSpreadPercentOutcome3: bn(0.337),
  // }),
  // validate({
  //   name: "scalar buy side empty so spread just uses other side #1",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "300", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.5),
  //   expectedSpreadPercentOutcome1: bn(0.5),
  // }),
  // validate({
  //   name: "scalar buy side empty so spread just uses other side #2",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "250", amount: "0.0000013" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.25),
  //   expectedSpreadPercentOutcome1: bn(0.25),
  // }),
  //
  // validate({
  //   name: "yesNo sell side empty so spread just uses other side",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "buy", price: "0.337", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.663),
  //   expectedSpreadPercentOutcome1: bn(0.663),
  // }),
  // validate({
  //   name: "categorical sell side empty so spread just uses other side",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "buy", price: "0.337", amount: "1337.75" },
  //     { outcome: 1, orderType: "buy", price: "0.337", amount: "1337.75" },
  //     { outcome: 2, orderType: "buy", price: "0.337", amount: "1337.75" },
  //     { outcome: 3, orderType: "buy", price: "0.337", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.663),
  //   expectedSpreadPercentOutcome0: bn(0.663),
  //   expectedSpreadPercentOutcome1: bn(0.663),
  //   expectedSpreadPercentOutcome2: bn(0.663),
  //   expectedSpreadPercentOutcome3: bn(0.663),
  // }),
  // validate({
  //   name: "scalar sell side empty so spread just uses other side #1",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "buy", price: "300", amount: "1337.75" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.5),
  //   expectedSpreadPercentOutcome1: bn(0.5),
  // }),
  // validate({
  //   name: "scalar sell side empty so spread just uses other side #2",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "buy", price: "250", amount: "0.0000013" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.75),
  //   expectedSpreadPercentOutcome1: bn(0.75),
  // }),
  //
  // validate({
  //   name: "yesNo one price",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.56", amount: "0.85" },
  //     { outcome: 1, orderType: "buy", price: "0.555", amount: "0.85" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.005),
  //   expectedSpreadPercentOutcome1: bn(0.005),
  // }),
  // validate({
  //   name: "categorical one price",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.56", amount: "0.85" },
  //     { outcome: 0, orderType: "buy", price: "0.555", amount: "0.85" },
  //     { outcome: 1, orderType: "sell", price: "0.56", amount: "0.85" },
  //     { outcome: 1, orderType: "buy", price: "0.555", amount: "0.85" },
  //     { outcome: 2, orderType: "sell", price: "0.56", amount: "0.85" },
  //     { outcome: 2, orderType: "buy", price: "0.555", amount: "0.85" },
  //     { outcome: 3, orderType: "sell", price: "0.56", amount: "0.85" },
  //     { outcome: 3, orderType: "buy", price: "0.555", amount: "0.85" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.005),
  //   expectedSpreadPercentOutcome0: bn(0.005),
  //   expectedSpreadPercentOutcome1: bn(0.005),
  //   expectedSpreadPercentOutcome2: bn(0.005),
  //   expectedSpreadPercentOutcome3: bn(0.005),
  // }),
  // validate({
  //   name: "scalar one price",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "303", amount: "0.85" },
  //     { outcome: 1, orderType: "buy", price: "299", amount: "0.85" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.02),
  //   expectedSpreadPercentOutcome1: bn(0.02),
  // }),
  //
  // validate({
  //   name: "yesNo two prices, but one quantity is really low so it's approxately the other price",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "10" },
  //     { outcome: 1, orderType: "sell", price: "0.79", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.21", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.2", amount: "10" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.6),
  // }),
  // validate({
  //   name: "categorical two prices, but one quantity is really low so it's approxately the other price",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.8", amount: "10" },
  //     { outcome: 0, orderType: "sell", price: "0.79", amount: "0.0001" },
  //     { outcome: 0, orderType: "buy",  price: "0.21", amount: "0.0001" },
  //     { outcome: 0, orderType: "buy",  price: "0.2", amount: "10" },
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "10" },
  //     { outcome: 1, orderType: "sell", price: "0.79", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.21", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.2", amount: "10" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "10" },
  //     { outcome: 2, orderType: "sell", price: "0.79", amount: "0.0001" },
  //     { outcome: 2, orderType: "buy",  price: "0.21", amount: "0.0001" },
  //     { outcome: 2, orderType: "buy",  price: "0.2", amount: "10" },
  //     { outcome: 3, orderType: "sell", price: "0.8", amount: "10" },
  //     { outcome: 3, orderType: "sell", price: "0.79", amount: "0.0001" },
  //     { outcome: 3, orderType: "buy",  price: "0.21", amount: "0.0001" },
  //     { outcome: 3, orderType: "buy",  price: "0.2", amount: "10" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.6),
  //   expectedSpreadPercentOutcome0: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.6),
  //   expectedSpreadPercentOutcome2: bn(0.6),
  //   expectedSpreadPercentOutcome3: bn(0.6),
  // }),
  // validate({
  //   name: "scalar two prices, but one quantity is really low so it's approxately the other price",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "399", amount: "10" },
  //     { outcome: 1, orderType: "sell", price: "350", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "250", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "201", amount: "10" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.99),
  //   expectedSpreadPercentOutcome1: bn(0.99),
  // }),
  //
  // validate({
  //   name: "yesNo 0% spread with one price",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.33", amount: "0.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.33", amount: "0.0001" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  // validate({
  //   name: "categorical 0% spread with one price",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.33", amount: "12.5" },
  //     { outcome: 0, orderType: "buy",  price: "0.33", amount: "12.5" },
  //     { outcome: 1, orderType: "sell", price: "1", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "1", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 3, orderType: "sell", price: "0", amount: "0.123" },
  //     { outcome: 3, orderType: "buy",  price: "0", amount: "0.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome0: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  //   expectedSpreadPercentOutcome2: bn(0),
  //   expectedSpreadPercentOutcome3: bn(0),
  // }),
  // validate({
  //   name: "scalar 0% spread with one price",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "250.5573345", amount: "137" },
  //     { outcome: 1, orderType: "buy",  price: "250.5573345", amount: "63" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  //
  // validate({
  //   name: "yesNo 0% spread with multiple prices",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.98", amount: "2.0001" },
  //     { outcome: 1, orderType: "sell", price: "0.33", amount: "10.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.33", amount: "10.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0.02", amount: "2.0001" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  // validate({
  //   name: "categorical 0% spread with multiple prices",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.98", amount: "2.5" },
  //     { outcome: 0, orderType: "sell", price: "0.33", amount: "12.5" },
  //     { outcome: 0, orderType: "buy",  price: "0.33", amount: "12.5" },
  //     { outcome: 0, orderType: "buy",  price: "0.02", amount: "2.5" },
  //     { outcome: 1, orderType: "sell", price: "1", amount: "0.02" },
  //     { outcome: 1, orderType: "sell", price: "0.99", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.99", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.01", amount: "0.001" },
  //     { outcome: 2, orderType: "sell", price: "0.75", amount: "0.123" },
  //     { outcome: 2, orderType: "sell", price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.48", amount: "0.123" },
  //     { outcome: 3, orderType: "sell", price: "1", amount: "0.000123" },
  //     { outcome: 3, orderType: "sell", price: "0.01", amount: "50.123" },
  //     { outcome: 3, orderType: "buy",  price: "0.01", amount: "123.123" },
  //     { outcome: 3, orderType: "buy",  price: "0", amount: "0.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome0: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  //   expectedSpreadPercentOutcome2: bn(0),
  //   expectedSpreadPercentOutcome3: bn(0),
  // }),
  // validate({
  //   name: "scalar 0% spread with multiple prices",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "398.5573345", amount: "0.0002" },
  //     { outcome: 1, orderType: "sell", price: "250.5573345", amount: "137" },
  //     { outcome: 1, orderType: "buy",  price: "250.5573345", amount: "63" },
  //     { outcome: 1, orderType: "buy",  price: "201", amount: "1" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  //
  // validate({
  //   name: "yesNo 100% spread with non-empty order book",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "1", amount: "10.0001" },
  //     { outcome: 1, orderType: "buy",  price: "0", amount: "2.0001" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  // }),
  // validate({
  //   name: "categorical 100% spread with non-empty order book",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "1", amount: "2.5" },
  //     { outcome: 0, orderType: "buy",  price: "0", amount: "2.5" },
  //     { outcome: 1, orderType: "sell", price: "1", amount: "1.02" },
  //     { outcome: 1, orderType: "buy",  price: "0", amount: "1.001" },
  //     { outcome: 2, orderType: "sell", price: "1", amount: "1.123" },
  //     { outcome: 2, orderType: "buy",  price: "0", amount: "1.123" },
  //     { outcome: 3, orderType: "sell", price: "1", amount: "1.000123" },
  //     { outcome: 3, orderType: "buy",  price: "0", amount: "1.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome0: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  //   expectedSpreadPercentOutcome2: bn(1),
  //   expectedSpreadPercentOutcome3: bn(1),
  // }),
  // validate({
  //   name: "scalar 100% spread with non-empty order book",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "400", amount: "0.0002" },
  //     { outcome: 1, orderType: "buy",  price: "200", amount: "0.000202" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  // }),
  //
  // validate({
  //   name: "yesNo multiple prices on both sides included in % of shares used in spread calc",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "112" },
  //     { outcome: 1, orderType: "sell", price: "0.7", amount: "4" },
  //     { outcome: 1, orderType: "sell", price: "0.6", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "0.2", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "0.1", amount: "4" },
  //   ],
  //   // WARNING - this test is very sensitive with the percentQuantityIncludedInSpread tuning parameter (currenty 10%). Sell side has 120 shares * 10% = 12 shares included in spread; sell side takes 4 shares from each of 0.6, 0.7, 0.8; buy side takes 4 shares from each of 0.2, 0.1, 0. That's an average price of sell=0.7, buy=0.1, and 0.7-0.1 = 0.6
  //   expectedSpreadPercentMarket: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.6),
  // }),
  // validate({
  //   name: "categorical multiple prices on both sides included in % of shares used in spread calc",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.8", amount: "112" },
  //     { outcome: 0, orderType: "sell", price: "0.7", amount: "4" },
  //     { outcome: 0, orderType: "sell", price: "0.6", amount: "4" },
  //     { outcome: 0, orderType: "buy",  price: "0.2", amount: "4" },
  //     { outcome: 0, orderType: "buy",  price: "0.1", amount: "4" },
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "112" },
  //     { outcome: 1, orderType: "sell", price: "0.7", amount: "4" },
  //     { outcome: 1, orderType: "sell", price: "0.6", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "0.2", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "0.1", amount: "4" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "112" },
  //     { outcome: 2, orderType: "sell", price: "0.7", amount: "4" },
  //     { outcome: 2, orderType: "sell", price: "0.6", amount: "4" },
  //     { outcome: 2, orderType: "buy",  price: "0.2", amount: "4" },
  //     { outcome: 2, orderType: "buy",  price: "0.1", amount: "4" },
  //     { outcome: 3, orderType: "sell", price: "0.8", amount: "112" },
  //     { outcome: 3, orderType: "sell", price: "0.7", amount: "4" },
  //     { outcome: 3, orderType: "sell", price: "0.6", amount: "4" },
  //     { outcome: 3, orderType: "buy",  price: "0.2", amount: "4" },
  //     { outcome: 3, orderType: "buy",  price: "0.1", amount: "4" },
  //   ],
  //   // WARNING - this test is very sensitive with the percentQuantityIncludedInSpread tuning parameter (currenty 10%). Sell side has 120 shares * 10% = 12 shares included in spread; sell side takes 4 shares from each of 0.6, 0.7, 0.8; buy side takes 4 shares from each of 0.2, 0.1, 0. That's an average price of sell=0.7, buy=0.1, and 0.7-0.1 = 0.6
  //   expectedSpreadPercentMarket: bn(0.6),
  //   expectedSpreadPercentOutcome0: bn(0.6),
  //   expectedSpreadPercentOutcome1: bn(0.6),
  //   expectedSpreadPercentOutcome2: bn(0.6),
  //   expectedSpreadPercentOutcome3: bn(0.6),
  // }),
  // validate({
  //   name: "scalar multiple prices on both sides included in % of shares used in spread calc",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "380", amount: "112" },
  //     { outcome: 1, orderType: "sell", price: "350", amount: "4" },
  //     { outcome: 1, orderType: "sell", price: "320", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "220", amount: "4" },
  //     { outcome: 1, orderType: "buy",  price: "210", amount: "4" },
  //   ],
  //   // WARNING - this test is very sensitive with the percentQuantityIncludedInSpread tuning parameter (currenty 10%). Sell side has 120 shares * 10% = 12 shares included in spread; sell side takes 4 shares from each of 320, 350, 380; buy side takes 4 shares from each of 220, 210, min=200. That's an average price of sell=350, buy=210, and (350-210)/200 = 0.7
  //   expectedSpreadPercentMarket: bn(0.7),
  //   expectedSpreadPercentOutcome1: bn(0.7),
  // }),
  //
  // validate({
  //   name: "yesNo spread percent zero if bid > ask",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.9", amount: "0.005" },
  //     { outcome: 1, orderType: "sell", price: "0.4", amount: "10" },
  //     { outcome: 1, orderType: "buy",  price: "0.5", amount: "10" },
  //     { outcome: 1, orderType: "buy",  price: "0.1", amount: "0.005" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  // validate({
  //   name: "categorical spread percent zero if bid > ask",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.9", amount: "0.005" },
  //     { outcome: 0, orderType: "sell", price: "0.4", amount: "10" },
  //     { outcome: 0, orderType: "buy",  price: "0.5", amount: "10" },
  //     { outcome: 0, orderType: "buy",  price: "0.1", amount: "0.005" },
  //     { outcome: 1, orderType: "sell", price: "0.9", amount: "0.005" },
  //     { outcome: 1, orderType: "sell", price: "0.3", amount: "10" },
  //     { outcome: 1, orderType: "buy",  price: "0.7", amount: "10" },
  //     { outcome: 1, orderType: "buy",  price: "0.1", amount: "0.005" },
  //     { outcome: 2, orderType: "sell", price: "0.9", amount: "0.005" },
  //     { outcome: 2, orderType: "sell", price: "0.50", amount: "10" },
  //     { outcome: 2, orderType: "buy",  price: "0.51", amount: "10" },
  //     { outcome: 2, orderType: "buy",  price: "0.1", amount: "0.005" },
  //     { outcome: 3, orderType: "sell", price: "0.9", amount: "0.005" },
  //     { outcome: 3, orderType: "sell", price: "0.01", amount: "10" },
  //     { outcome: 3, orderType: "buy",  price: "0.02", amount: "10" },
  //     { outcome: 3, orderType: "buy",  price: "0.1", amount: "0.005" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome0: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  //   expectedSpreadPercentOutcome2: bn(0),
  //   expectedSpreadPercentOutcome3: bn(0),
  // }),
  // validate({
  //   name: "scalar spread percent zero if bid > ask",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "350", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "325", amount: "50.123" },
  //     { outcome: 1, orderType: "buy",  price: "325.5", amount: "500.123" },
  //     { outcome: 1, orderType: "buy",  price: "210", amount: "1" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0),
  //   expectedSpreadPercentOutcome1: bn(0),
  // }),
  //
  // validate({
  //   name: "yesNo buy side very small amount",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.2", amount: "100.123" },
  //     { outcome: 1, orderType: "buy",  price: "0.19", amount: "0.005" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.2),
  //   expectedSpreadPercentOutcome1: bn(0.2),
  // }),
  // validate({
  //   name: "categorical buy side very small amount",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.2", amount: "100.123" },
  //     { outcome: 0, orderType: "buy",  price: "0.19", amount: "0.005" },
  //     { outcome: 1, orderType: "sell", price: "0.05", amount: "100.123" },
  //     { outcome: 1, orderType: "buy",  price: "0.01", amount: "0.005" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "100.123" },
  //     { outcome: 2, orderType: "buy",  price: "0.75", amount: "0.005" },
  //     { outcome: 3, orderType: "sell", price: "0.2", amount: "100.123" },
  //     { outcome: 3, orderType: "buy",  price: "0.3", amount: "0.005" }, // for outcome 3 we have buy > sell, but just like other outcomes the buy is sweeped and then most of the buy-side qty is filled at price=0 giving us 0.2 spread
  //   ],
  //   expectedSpreadPercentMarket: bn(0.8),
  //   expectedSpreadPercentOutcome0: bn(0.2),
  //   expectedSpreadPercentOutcome1: bn(0.05),
  //   expectedSpreadPercentOutcome2: bn(0.8),
  //   expectedSpreadPercentOutcome3: bn(0.2),
  // }),
  // validate({
  //   name: "scalar buy side very small amount",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "300", amount: "100.123" },
  //     { outcome: 1, orderType: "buy",  price: "298", amount: "0.005" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.5),
  //   expectedSpreadPercentOutcome1: bn(0.5),
  // }),
  //
  // validate({
  //   name: "yesNo sell side very small amount",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell",  price: "0.32", amount: "0.005" },
  //     { outcome: 1, orderType: "buy", price: "0.32", amount: "100.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.68),
  //   expectedSpreadPercentOutcome1: bn(0.68),
  // }),
  // validate({
  //   name: "categorical sell side very small amount",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell",  price: "0.60", amount: "0.005" },
  //     { outcome: 0, orderType: "buy", price: "0.61", amount: "100.123" },
  //     { outcome: 1, orderType: "sell",  price: "0.01", amount: "0.005" },
  //     { outcome: 1, orderType: "buy", price: "0.01", amount: "100.123" },
  //     { outcome: 2, orderType: "sell",  price: "1", amount: "0.005" },
  //     { outcome: 2, orderType: "buy", price: "1", amount: "100.123" },
  //     { outcome: 3, orderType: "sell",  price: "0.32", amount: "0.005" },
  //     { outcome: 3, orderType: "buy", price: "0.32", amount: "100.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.99),
  //   expectedSpreadPercentOutcome0: bn(0.39),
  //   expectedSpreadPercentOutcome1: bn(0.99),
  //   expectedSpreadPercentOutcome2: bn(0),
  //   expectedSpreadPercentOutcome3: bn(0.68),
  // }),
  // validate({
  //   name: "scalar sell side very small amount",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "300", amount: "0.005" },
  //     { outcome: 1, orderType: "buy",  price: "298", amount: "100.123" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.51),
  //   expectedSpreadPercentOutcome1: bn(0.51),
  // }),
  //
  // validate({
  //   name: "yesNo order book with many entries",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell",  price: "0.38", amount: "1000" },
  //     { outcome: 1, orderType: "sell",  price: "0.37", amount: "0.5" },
  //     { outcome: 1, orderType: "sell",  price: "0.36", amount: "7" },
  //     { outcome: 1, orderType: "sell",  price: "0.35", amount: "3.5" },
  //     { outcome: 1, orderType: "sell",  price: "0.34", amount: "2" },
  //     { outcome: 1, orderType: "sell",  price: "0.33", amount: "2" },
  //     { outcome: 1, orderType: "sell",  price: "0.32", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "0.28", amount: "5.05" },
  //     { outcome: 1, orderType: "buy", price: "0.265", amount: "0.8" },
  //     { outcome: 1, orderType: "buy", price: "0.23", amount: "1.2" },
  //     { outcome: 1, orderType: "buy", price: "0.22", amount: "2.5" },
  //     { outcome: 1, orderType: "buy", price: "0.215", amount: "12" },
  //     { outcome: 1, orderType: "buy", price: "0.20", amount: "3.7" },
  //     { outcome: 1, orderType: "buy", price: "0.18", amount: "220" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.1831),
  //   expectedSpreadPercentOutcome1: bn(0.1831),
  // }),
  // validate({
  //   name: "categorical order book with many entries",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 3, orderType: "sell",  price: "0.38", amount: "1000" },
  //     { outcome: 3, orderType: "sell",  price: "0.37", amount: "0.5" },
  //     { outcome: 3, orderType: "sell",  price: "0.36", amount: "7" },
  //     { outcome: 3, orderType: "sell",  price: "0.35", amount: "3.5" },
  //     { outcome: 3, orderType: "sell",  price: "0.34", amount: "2" },
  //     { outcome: 3, orderType: "sell",  price: "0.33", amount: "2" },
  //     { outcome: 3, orderType: "sell",  price: "0.32", amount: "1" },
  //     { outcome: 3, orderType: "buy", price: "0.28", amount: "5.05" },
  //     { outcome: 3, orderType: "buy", price: "0.265", amount: "0.8" },
  //     { outcome: 3, orderType: "buy", price: "0.23", amount: "1.2" },
  //     { outcome: 3, orderType: "buy", price: "0.22", amount: "2.5" },
  //     { outcome: 3, orderType: "buy", price: "0.215", amount: "12" },
  //     { outcome: 3, orderType: "buy", price: "0.20", amount: "3.7" },
  //     { outcome: 3, orderType: "buy", price: "0.18", amount: "220" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome0: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  //   expectedSpreadPercentOutcome2: bn(1),
  //   expectedSpreadPercentOutcome3: bn(0.1831),
  // }),
  // validate({
  //   name: "scalar order book with many entries",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell",  price: "276", amount: "1000" },
  //     { outcome: 1, orderType: "sell",  price: "274", amount: "0.5" },
  //     { outcome: 1, orderType: "sell",  price: "272", amount: "7" },
  //     { outcome: 1, orderType: "sell",  price: "270", amount: "3.5" },
  //     { outcome: 1, orderType: "sell",  price: "268", amount: "2" },
  //     { outcome: 1, orderType: "sell",  price: "266", amount: "2" },
  //     { outcome: 1, orderType: "sell",  price: "264", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "256", amount: "5.05" },
  //     { outcome: 1, orderType: "buy", price: "253", amount: "0.8" },
  //     { outcome: 1, orderType: "buy", price: "246", amount: "1.2" },
  //     { outcome: 1, orderType: "buy", price: "244", amount: "2.5" },
  //     { outcome: 1, orderType: "buy", price: "243", amount: "12" },
  //     { outcome: 1, orderType: "buy", price: "240", amount: "3.7" },
  //     { outcome: 1, orderType: "buy", price: "236", amount: "220" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.1831),
  //   expectedSpreadPercentOutcome1: bn(0.1831),
  // }),
  //
  // validate({
  //   name: "yesNo order book with multiple orders at same price",
  //   marketId: yesNoId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "100" },
  //     { outcome: 1, orderType: "sell", price: "0.8", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.4", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "0.4", amount: "100" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.3423),
  //   expectedSpreadPercentOutcome1: bn(0.3423),
  // }),
  // validate({
  //   name: "categorical order book with multiple orders at same price",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "100" },
  //     { outcome: 2, orderType: "sell", price: "0.8", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.5", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.4", amount: "1" },
  //     { outcome: 2, orderType: "buy",  price: "0.4", amount: "100" },
  //   ],
  //   expectedSpreadPercentMarket: bn(1),
  //   expectedSpreadPercentOutcome0: bn(1),
  //   expectedSpreadPercentOutcome1: bn(1),
  //   expectedSpreadPercentOutcome2: bn(0.3423),
  //   expectedSpreadPercentOutcome3: bn(1),
  // }),
  // validate({
  //   name: "scalar order book with multiple orders at same price",
  //   marketId: scalarId,
  //   logs: [
  //     { outcome: 1, orderType: "sell", price: "360", amount: "100" },
  //     { outcome: 1, orderType: "sell", price: "360", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "340", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "340", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "340", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "300", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "300", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "300", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "280", amount: "1" },
  //     { outcome: 1, orderType: "buy",  price: "280", amount: "100" },
  //   ],
  //   expectedSpreadPercentMarket: bn(0.3423),
  //   expectedSpreadPercentOutcome1: bn(0.3423),
  // }),

  validateROI({
    isTestingInvalidROIPercent: true,
    name: "yesNo buy side empty",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.6", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "categorical buy side empty",
    marketId: catId,
    logs: [
      { outcome: 0, orderType: "sell", price: "0.6", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.6", amount: "1" },
      { outcome: 2, orderType: "sell", price: "0.6", amount: "1" },
      { outcome: 3, orderType: "sell", price: "0.6", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome0: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
    expectedInvalidROIPercentOutcome2: bn(0),
    expectedInvalidROIPercentOutcome3: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "scalar buy side empty",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "320", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),

  validateROI({
    isTestingInvalidROIPercent: true,
    name: "yesNo sell side empty",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "buy", price: "0.4", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "categorical sell side empty",
    marketId: catId,
    logs: [
      { outcome: 0, orderType: "buy", price: "0.4", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.4", amount: "1" },
      { outcome: 2, orderType: "buy", price: "0.4", amount: "1" },
      { outcome: 3, orderType: "buy", price: "0.4", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome0: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
    expectedInvalidROIPercentOutcome2: bn(0),
    expectedInvalidROIPercentOutcome3: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "scalar sell side empty",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "buy", price: "240", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),

  validateROI({
    isTestingInvalidROIPercent: true,
    name: "yesNo only buy side makes money on invalid",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.25", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "categorical only buy side makes money on invalid",
    marketId: catId,
    logs: [
      { outcome: 0, orderType: "sell", price: "0.25", amount: "1" },
      { outcome: 0, orderType: "buy", price: "0.15", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.25", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
      { outcome: 2, orderType: "sell", price: "0.25", amount: "1" },
      { outcome: 2, orderType: "buy", price: "0.15", amount: "1" },
      { outcome: 3, orderType: "sell", price: "0.25", amount: "1" },
      { outcome: 3, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome0: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
    expectedInvalidROIPercentOutcome2: bn(0),
    expectedInvalidROIPercentOutcome3: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "scalar only buy side makes money on invalid",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "280", amount: "1" },
      { outcome: 1, orderType: "buy", price: "220", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),

  validateROI({
    isTestingInvalidROIPercent: true,
    name: "yesNo only sell side makes money on invalid",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.65", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "categorical only sell side makes money on invalid",
    marketId: catId,
    logs: [
      { outcome: 0, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 0, orderType: "buy", price: "0.65", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.65", amount: "1" },
      { outcome: 2, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 2, orderType: "buy", price: "0.25", amount: "1" },
      { outcome: 3, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 3, orderType: "buy", price: "0.65", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome0: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
    expectedInvalidROIPercentOutcome2: bn(0),
    expectedInvalidROIPercentOutcome3: bn(0),
  }),
  validateROI({
    isTestingInvalidROIPercent: true,
    name: "scalar only sell side makes money on invalid",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "380", amount: "1" },
      { outcome: 1, orderType: "buy", price: "350", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),

  validateROI({
    // yesNoId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "yesNo both sides make money on invalid #1",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.8", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.2", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0.5),
    expectedInvalidROIPercentOutcome1: bn(0.5),
  }),
  validateROI({
    // yesNoId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "yesNo both sides make money on invalid #2",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.7", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.3", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    // yesNoId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "yesNo both sides make money on invalid #3",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.85", amount: "1" },
      { outcome: 1, orderType: "sell", price: "0.8", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0.75),
    expectedInvalidROIPercentOutcome1: bn(0.75),
  }),
  validateROI({
    // yesNoId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "yesNo both sides make money on invalid #4",
    marketId: yesNoId,
    logs: [
      { outcome: 1, orderType: "sell", price: "0.700001", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.299999", amount: "1" },
      { outcome: 1, orderType: "buy", price: "0.15", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  // validateROI({
  //   // catId has 40% total fees which are included in invalidROI calculation; catId has 4 outcomes so the invalidSharePriceWithFees is 0.15
  //   isTestingInvalidROIPercent: true,
  //   name: "categorical both sides make money on invalid #1",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 0, orderType: "sell", price: "0.925", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.10", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.05", amount: "1" },
  //   ],
  //   expectedInvalidROIPercent: bn(0.75),
  //   expectedInvalidROIPercentOutcome0: bn(0.75),
  //   expectedInvalidROIPercentOutcome1: bn(0),
  //   expectedInvalidROIPercentOutcome2: bn(0),
  //   expectedInvalidROIPercentOutcome3: bn(0),
  // }),
  // validateROI({
  //   // catId has 40% total fees which are included in invalidROI calculation; catId has 4 outcomes so the invalidSharePriceWithFees is 0.15
  //   isTestingInvalidROIPercent: true,
  //   name: "categorical both sides make money on invalid #2",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 0, orderType: "sell", price: "0.9", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.149999", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.05", amount: "1" },
  //   ],
  //   expectedInvalidROIPercent: bn(0.25),
  //   expectedInvalidROIPercentOutcome0: bn(0.25),
  //   expectedInvalidROIPercentOutcome1: bn(0),
  //   expectedInvalidROIPercentOutcome2: bn(0),
  //   expectedInvalidROIPercentOutcome3: bn(0),
  // }),
  // validateROI({
  //   // catId has 40% total fees which are included in invalidROI calculation; catId has 4 outcomes so the invalidSharePriceWithFees is 0.15
  //   isTestingInvalidROIPercent: true,
  //   name: "categorical both sides make money on invalid #3",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 0, orderType: "sell", price: "0.9", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.1", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.05", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.925", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "0.1", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "0.05", amount: "1" },
  //   ],
  //   expectedInvalidROIPercent: bn(0.75),
  //   expectedInvalidROIPercentOutcome0: bn(0.5),
  //   expectedInvalidROIPercentOutcome1: bn(0.75),
  //   expectedInvalidROIPercentOutcome2: bn(0),
  //   expectedInvalidROIPercentOutcome3: bn(0),
  // }),
  // validateROI({
  //   // catId has 40% total fees which are included in invalidROI calculation; catId has 4 outcomes so the invalidSharePriceWithFees is 0.15
  //   isTestingInvalidROIPercent: true,
  //   name: "categorical both sides make money on invalid #4",
  //   marketId: catId,
  //   logs: [
  //     { outcome: 0, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 0, orderType: "sell", price: "0.9", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.1", amount: "1" },
  //     { outcome: 0, orderType: "buy", price: "0.05", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 1, orderType: "sell", price: "0.925", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "0.1", amount: "1" },
  //     { outcome: 1, orderType: "buy", price: "0.05", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.95", amount: "1" },
  //     { outcome: 2, orderType: "sell", price: "0.925", amount: "1" },
  //     { outcome: 2, orderType: "buy", price: "0.1", amount: "1" },
  //     { outcome: 2, orderType: "buy", price: "0.05", amount: "1" },
  //     { outcome: 3, orderType: "sell", price: "0.7", amount: "1" },
  //     { outcome: 3, orderType: "buy", price: "0.3", amount: "1" },
  //   ],
  //   expectedInvalidROIPercent: bn(0.75),
  //   expectedInvalidROIPercentOutcome0: bn(0.5),
  //   expectedInvalidROIPercentOutcome1: bn(0.75),
  //   expectedInvalidROIPercentOutcome2: bn(0.75),
  //   expectedInvalidROIPercentOutcome3: bn(0),
  // }),
  validateROI({
    // scalarId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "scalar both sides make money on invalid #1",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "370", amount: "1" },
      { outcome: 1, orderType: "sell", price: "360", amount: "1" },
      { outcome: 1, orderType: "buy", price: "240", amount: "1" },
      { outcome: 1, orderType: "buy", price: "230", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0.5),
    expectedInvalidROIPercentOutcome1: bn(0.5),
  }),
  validateROI({
    // scalarId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "scalar both sides make money on invalid #2",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "370", amount: "1" },
      { outcome: 1, orderType: "sell", price: "340", amount: "1" },
      { outcome: 1, orderType: "buy", price: "260", amount: "1" },
      { outcome: 1, orderType: "buy", price: "230", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
  validateROI({
    // scalarId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "scalar both sides make money on invalid #3",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "370", amount: "1" },
      { outcome: 1, orderType: "sell", price: "360", amount: "1" },
      { outcome: 1, orderType: "buy", price: "230", amount: "1" },
      { outcome: 1, orderType: "buy", price: "230", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0.75),
    expectedInvalidROIPercentOutcome1: bn(0.75),
  }),
  validateROI({
    // scalarId has 40% total fees which are included in invalidROI calculation
    isTestingInvalidROIPercent: true,
    name: "scalar both sides make money on invalid #4",
    marketId: scalarId,
    logs: [
      { outcome: 1, orderType: "sell", price: "340.00001", amount: "1" },
      { outcome: 1, orderType: "buy", price: "259.99999", amount: "1" },
      { outcome: 1, orderType: "buy", price: "230", amount: "1" },
    ],
    expectedInvalidROIPercent: bn(0),
    expectedInvalidROIPercentOutcome1: bn(0),
  }),
];

async function convertDisplayPriceToOnChainPrice(db, marketId, displayPrice) {
  const marketsQuery = await db.first("minPrice", "maxPrice", "numTicks").from("markets").where({marketId});
  if (!marketsQuery) throw new Error(`expected to find market with id ${marketId}`);
  const tickSize = numTicksToTickSize(marketsQuery.numTicks, marketsQuery.minPrice, marketsQuery.maxPrice);
  return augur.utils.convertDisplayPriceToOnChainPrice(bn(displayPrice), marketsQuery.minPrice, tickSize);
}

async function convertDisplayAmountToOnChainAmount(db, marketId, displayAmount) {
  const marketsQuery = await db.first("minPrice", "maxPrice", "numTicks").from("markets").where({marketId});
  if (!marketsQuery) throw new Error(`expected to find market with id ${marketId}`);
  const displayRange = marketsQuery.maxPrice.minus(marketsQuery.minPrice);
  return augur.utils.convertDisplayAmountToOnChainAmount(displayAmount.toString(), displayRange, marketsQuery.numTicks);
}

let orderId = 0; // used to auto-increment fake orderIds
async function testLogToOrderCreatedLog(db, marketId, testLog) {
  orderId++;
  // Only price and amount are required to be real for this test, other values fake.
  return {
    orderType: testLog.orderType === "buy" ? "0" : "1",
    shareToken: (await db.first().from("tokens").where({ marketId, outcome: testLog.outcome })).contractAddress,
    price: await convertDisplayPriceToOnChainPrice(db, marketId, testLog.price),
    amount: await convertDisplayAmountToOnChainAmount(db, marketId, testLog.amount),
    sharesEscrowed: "0",
    moneyEscrowed: "0",
    creator: "ORDER_CREATOR",
    orderId: `ORDER_${orderId}`, // required to be unique
    tradeGroupId: "FAKE_TRADE_GROUP_ID",
    blockNumber: 1400100 + orderId,
    transactionHash: `TRANSACTION_HASH_${orderId}`,
    logIndex: 0,
  };
}

const runOneTestCase = (testCase) => {
  describe(testCase.name, () => {
    let db, spreadPercent, invalidROIPercent;
    beforeEach(async () => {
      db = await setupTestDb().then(seedDb);
      if (db === undefined) throw new Error("expected db to be defined");

      for (const log of testCase.logs) {
        // testCase.logs are thin/fake logs that need to be mapped to real logs
        const orderCreatedLog = await testLogToOrderCreatedLog(db, testCase.marketId, log);
        await(await processOrderCreatedLog(augur, orderCreatedLog))(db);
      }

      await checkMarketLiquidityUpdates(db);

      const marketsQuery = await db("markets").first().where({ marketId: testCase.marketId });
      if (!marketsQuery) throw new Error(`expected to find market with marketId=${testCase.marketId}`);
      spreadPercent = marketsQuery.spreadPercent;
      invalidROIPercent = marketsQuery.invalidROIPercent;
    });

    afterEach(async () => {
      await db.destroy();
      db = undefined;
      spreadPercent = undefined;
      invalidROIPercent = undefined;
    });

    function smartExpectSpreadPercent(actualSpreadPercent, expectedSpreadPercent) {
      // actualSpreadPercent and expectedSpreadPercent are BigNumber
      if (expectedSpreadPercent === bn(0) || expectedSpreadPercent === bn(1)) {
        // disallow approximate matching if spreadPercent is expected to be zero or one to ensure that default values/empty books are being calc'd correctly.
        expect(actualSpreadPercent).toEqual(expectedSpreadPercent);
      } else {
        expect(actualSpreadPercent.toNumber()).toBeCloseTo(expectedSpreadPercent.toNumber());
      }
    }

    if (testCase.isTestingInvalidROIPercent) {
      test("invalidROIPercent for market", () => {
        expect(invalidROIPercent.toNumber()).toBeCloseTo(testCase.expectedInvalidROIPercent.toNumber(), 5);
      });
    } else {
      test("spreadPercent for market", () => {
        smartExpectSpreadPercent(spreadPercent, testCase.expectedSpreadPercentMarket);
      });
    }

    // We'll generate an outcome spreadPercent test case for
    // up to 8 outcomes for the passed testCase.marketId.
    Array(8).fill(0).forEach((_, i) => {
      const outcomesUsedForThisMarket = outcomesByMarketId[testCase.marketId];
      if (!outcomesUsedForThisMarket) throw new Error(`expected to find marketId=${testCase.marketId} in outcomesByMarketId`);
      if (!outcomesUsedForThisMarket.includes(i)) {
        // outcome `i` isn't used by testCase.marketId
        return;
      }
      if (testCase.isTestingInvalidROIPercent) {
        test(`invalidROIPercent for outcome ${i}`, async () => {
          if (!testCase.hasOwnProperty(`expectedInvalidROIPercentOutcome${i}`)) {
            throw new Error(`missing expected invalidROIPercent for outcome ${i}`);
          }

          const outcomesQuery = await db("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
          if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);

          expect(outcomesQuery.invalidROIPercent.toNumber()).toBeCloseTo(testCase[`expectedInvalidROIPercentOutcome${i}`].toNumber(), 5);
        });
      } else {
        test(`spreadPercent for outcome ${i}`, async () => {
          if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
            throw new Error(`missing expected spreadPercent for outcome ${i}`);
          }

          const outcomesQuery = await db("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
          if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);

          smartExpectSpreadPercent(outcomesQuery.spreadPercent, testCase[`expectedSpreadPercentOutcome${i}`]);
        });
      }
    });
  });
};

testCases.forEach(runOneTestCase);

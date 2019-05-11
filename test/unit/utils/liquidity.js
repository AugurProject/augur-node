// jest.mock("src/blockchain/process-block");
const { fix } = require("speedomatic");
const { BigNumber } = require("bignumber.js");
const Augur = require("augur.js");
// const processBlock = require("src/blockchain/process-block");
import { setupTestDb, seedDb } from "../test.database";
import { processOrderCreatedLog } from "src/blockchain/log-processors/order-created";

import { updateSpreadPercentForMarketAndOutcomes } from "src/utils/liquidity";

/*
  NEXT UP
    create shareToken seeds for each outcome
    create a simplified OrderCreated log datastructure for test cases, something like (marketId, buy | sell, price, amount)
    the async test execution should map the testCase OrderCreated logs into actual order logs and then execute them
    then start writing tests with created orders
*/

// const log = {
//   orderType: "0",
//   shareToken: "0x0100000000000000000000000000000000000000",
//   price: "7500",
//   amount: augur.utils.convertDisplayAmountToOnChainAmount("3", new BigNumber(1), new BigNumber(10000)).toString(),
//   sharesEscrowed: "0",
//   moneyEscrowed: fix("2.25", "string"),
//   creator: "CREATOR_ADDRESS",
//   orderId: "ORDER_ID",
//   tradeGroupId: "TRADE_GROUP_ID",
//   blockNumber: 1400100,
//   transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
//   logIndex: 0,
// };

function validate(testCase) {
  function assertHas(prop) {
    if (!testCase.hasOwnProperty(prop)) throw new Error(`expected test case to have property ${prop}, testCase=${testCase}`);
  }
  assertHas("name");
  assertHas("marketId");
  assertHas("logs");
  assertHas("expectedSpreadPercentMarket");
  assertHas("expectedSpreadPercentOutcome1"); // every testCase checks outcome 1, but only categoricals check [0, numOutcomes-1]
  return testCase;
}

function bn(n) {
  return new BigNumber(n, 10);
}

const yesNoId = "0xfd9d2cab985b4e1052502c197d989fdf9e7d4b1e"; // marketId of a yesNo market in seeds/markets that has no seeds/orders
const scalarId = "0x0000000000000000000000000000000000000ff1"; // marketId of a scalar market in seeds/markets that has no seeds/orders; has minPrice=200, maxPrice=400
const catId = "0x0000000000000000000000000000000000000015"; // marketId of a categorical market in seeds/markets that has no seeds/orders; has 4 outcomes

const tests = [
  validate({
    name: "yesNo empty has spread of 100%",
    marketId: yesNoId,
    logs: [],
    expectedSpreadPercentMarket: bn(1),
    expectedSpreadPercentOutcome1: bn(1),
  }),
  validate({
    name: "categorical empty has spread of 100%",
    marketId: catId,
    logs: [],
    expectedSpreadPercentMarket: bn(1),
    expectedSpreadPercentOutcome0: bn(1),
    expectedSpreadPercentOutcome1: bn(1),
    expectedSpreadPercentOutcome2: bn(1),
    expectedSpreadPercentOutcome3: bn(1),
  }),
  validate({
    name: "scalar empty has spread of 100%",
    marketId: scalarId,
    logs: [],
    expectedSpreadPercentMarket: bn(1),
    expectedSpreadPercentOutcome1: bn(1),
  }),
  validate({
    name: "TODO yesNo thin market",
    marketId: yesNoId,
    logs: [],
    // logs: [{
    //   orderType: "0",
    //   shareToken: "0x0100000000000000000000000000000000000000",
    //   price: "7500",
    //   amount: augur.utils.convertDisplayAmountToOnChainAmount("3", new BigNumber(1), new BigNumber(10000)).toString(),
    //   sharesEscrowed: "0",
    //   moneyEscrowed: fix("2.25", "string"),
    //   creator: "CREATOR_ADDRESS",
    //   orderId: "ORDER_ID",
    //   tradeGroupId: "TRADE_GROUP_ID",
    //   blockNumber: 1400100,
    //   transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000B00",
    //   logIndex: 0,
    // }],
    expectedSpreadPercentMarket: bn(1), // TODO 0.6
    expectedSpreadPercentOutcome1: bn(1), // TODO 0.6
  }),
];

const runTest = (testCase) => {
  describe(testCase.name, () => {
    let db, spreadPercent, numOutcomes, marketType;
    const augur = new Augur();
    beforeEach(async () => {
      db = await setupTestDb().then(seedDb);
      if (db === undefined) throw new Error("expected db to be defined");

      for (const log of testCase.logs) {
        await(await processOrderCreatedLog(augur, log))(db);
      }
      await updateSpreadPercentForMarketAndOutcomes(db, testCase.marketId);

      const marketsQuery = await db("markets").first().where({ marketId: testCase.marketId });
      if (!marketsQuery) throw new Error(`expected to find market with marketId=${testCase.marketId}`);
      spreadPercent = marketsQuery.spreadPercent;
      numOutcomes = marketsQuery.numOutcomes;
      marketType = marketsQuery.marketType;
    });

    afterEach(async () => {
      await db.destroy();
      db = undefined;
      spreadPercent = undefined;
      numOutcomes = undefined;
      marketType = undefined;
    });

    test("spreadPercent for market", () => {
      expect(spreadPercent).toEqual(testCase.expectedSpreadPercentMarket);
    });

    // We don't yet know how many numOutcomes this market has because it
    // won't be queried until the tests are evaluated asynchronously. We'll
    // generate one test per maximum of 8 outcomes, but not all may be used.
    Array(8).fill(0).forEach((_, i) => {
      test(`spreadPercent for outcome ${i}`, async () => {
        const startOutcome = marketType === "categorical" ? 0 : 1;
        const endOutcome = marketType === "categorical" ? (numOutcomes - 1) : 1;
        if (i < startOutcome || i > endOutcome) return; // we had to generate 8 outcome test cases up front for outcomes [0..7] inclusive, but we only actually need tests between [startOutcome, endOutcome] inclusive

        if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
          throw new Error(`missing expected spreadPercent for outcome ${i}`);
        }

        const outcomesQuery = await db("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
        if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);

        expect(testCase[`expectedSpreadPercentOutcome${i}`]).toEqual(outcomesQuery.spreadPercent);

        // for (let i = startOutcome; i < endOutcome; i++) {
        //   if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
        //     throw new Error(`categorical test case omitted expectedSpreadPercent for outcome ${i}, testCase=${testCase}`);
        //   }
        //   const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
        //   if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);
        //
        //   test(`spreadPercent for marketId=${testCase.marketId}, outcome=${i}`, () => expect(testCase[`expectedSpreadPercentOutcome${i}`]).toEqual(outcomesQuery.spreadPercent));
      });
    });

    // for (let j = 0; j < 8; j++) {
    //   // generate one test per outcome, but not all may be used
    //   test(`outcomes.spreadPercent ${j}`, ((j2) => async () => {
    //     const startOutcome = marketType === "categorical" ? 0 : 1;
    //     const endOutcome = marketType === "categorical" ? numOutcomes : 2;
    //     // for (let i = startOutcome; i < endOutcome; i++) {
    //     //   if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
    //     //     throw new Error(`categorical test case omitted expectedSpreadPercent for outcome ${i}, testCase=${testCase}`);
    //     //   }
    //     //   const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
    //     //   if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);
    //     //
    //     //   test(`spreadPercent for marketId=${testCase.marketId}, outcome=${i}`, () => expect(testCase[`expectedSpreadPercentOutcome${i}`]).toEqual(outcomesQuery.spreadPercent));
    //   })(j));
    // }

    // await db.transaction(async (trx) => {
    //   for (const log of testCase.logs) {
    //     await(await processOrderCreatedLog(augur, log))(trx);
    //   }
    //   await updateSpreadPercentForMarketAndOutcomes(trx, testCase.marketId);
    //
    //   const marketsQuery = await trx("markets").first().where({ marketId: testCase.marketId });
    //   if (!marketsQuery) throw new Error(`expected to find market with marketId=${testCase.marketId}`);
    //   const { spreadPercent, numOutcomes, marketType } = marketsQuery;
    //
    //   // verify market.spreadPercent
    //   // expect(spreadPercent).toEqual(testCase.expectedSpreadPercentMarket);
    //
    //   // verify spreadPercent for each outcome. Verify only outcome 1 for yesNo/scalar markets because they use only outcome 1
    //   const startOutcome = marketType === "categorical" ? 0 : 1;
    //   const endOutcome = marketType === "categorical" ? numOutcomes : 2;
    //   for (let i = startOutcome; i < endOutcome; i++) {
    //     if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
    //       throw new Error(`categorical test case omitted expectedSpreadPercent for outcome ${i}, testCase=${testCase}`);
    //     }
    //     const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
    //     if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);
    //
    //     test(`spreadPercent for marketId=${testCase.marketId}, outcome=${i}`, () => expect(testCase[`expectedSpreadPercentOutcome${i}`]).toEqual(outcomesQuery.spreadPercent));
    //   }
      // } else {
      //   // market in this test is scalar or yesNo in which case only outcome 1 is used
      //   const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: 1 });
      //   if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=1`);
      //
      //   const { outcomeSpreadPercent } = await trx("outcomes").first("spreadPercent").where({ marketId: testCase.marketId, outcome: 1 });
      //   expect(testCase.expectedSpreadPercentOutcome1).toEqual(outcomeSpreadPercent);
      // }
    // });
  });
};

for (const testCase of tests) {
  runTest(testCase);
}

// describe("liquidity", async () => {
//   const runTest = async (testCase) => {
//     describe(testCase.name, async () => {
//       let db;
//       const augur = new Augur();
//       beforeEach(async () => {
//         db = await setupTestDb().then(seedDb);
//         if (db === undefined) throw new Error("expected db to be defined");
//       });
//
//       afterEach(async () => {
//         await db.destroy();
//         db = undefined;
//       });
//
//       await db.transaction(async (trx) => {
//         for (const log of testCase.logs) {
//           await(await processOrderCreatedLog(augur, log))(trx);
//         }
//         await updateSpreadPercentForMarketAndOutcomes(trx, testCase.marketId);
//
//         const marketsQuery = await trx("markets").first().where({ marketId: testCase.marketId });
//         if (!marketsQuery) throw new Error(`expected to find market with marketId=${testCase.marketId}`);
//         const { spreadPercent, numOutcomes, marketType } = marketsQuery;
//
//         // verify market.spreadPercent
//         // expect(spreadPercent).toEqual(testCase.expectedSpreadPercentMarket);
//
//         // verify spreadPercent for each outcome. Verify only outcome 1 for yesNo/scalar markets because they use only outcome 1
//         const startOutcome = marketType === "categorical" ? 0 : 1;
//         const endOutcome = marketType === "categorical" ? numOutcomes : 2;
//         for (let i = startOutcome; i < endOutcome; i++) {
//           if (!testCase.hasOwnProperty(`expectedSpreadPercentOutcome${i}`)) {
//             throw new Error(`categorical test case omitted expectedSpreadPercent for outcome ${i}, testCase=${testCase}`);
//           }
//           const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: i });
//           if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=${i}`);
//
//           test(`spreadPercent for marketId=${testCase.marketId}, outcome=${i}`, () => expect(testCase[`expectedSpreadPercentOutcome${i}`]).toEqual(outcomesQuery.spreadPercent));
//         }
//         // } else {
//         //   // market in this test is scalar or yesNo in which case only outcome 1 is used
//         //   const outcomesQuery = await trx("outcomes").first().where({ marketId: testCase.marketId, outcome: 1 });
//         //   if (!outcomesQuery) throw new Error(`expected to find outcome with marketId=${testCase.marketId} outcome=1`);
//         //
//         //   const { outcomeSpreadPercent } = await trx("outcomes").first("spreadPercent").where({ marketId: testCase.marketId, outcome: 1 });
//         //   expect(testCase.expectedSpreadPercentOutcome1).toEqual(outcomeSpreadPercent);
//         // }
//       });
//     });
//   };
//
//   for (const testCase of tests) {
//     await runTest(testCase);
//   }
//   // tests.forEach(t => runTest(t));
// });

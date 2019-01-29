
import BigNumber from "bignumber.js";
import { volumeForTrade } from "src/blockchain/log-processors/order-filled/update-volumetrics";

test("volumeForTrade", () => {
  const testData = [
    {
      name: "general test case where every input contributes to the output",
      marketMinPrice: new BigNumber("-5", 10),
      marketMaxPrice: new BigNumber("50", 10),
      numCreatorTokens: new BigNumber("17", 10),
      numCreatorShares: new BigNumber("19", 10),
      numFillerTokens: new BigNumber("31", 10),
      numFillerShares: new BigNumber("70", 10),
      expectedVolume: new BigNumber("1093", 10),
    },
    // append test cases here as needed
  ];

  testData.forEach(td => {
    expect(volumeForTrade({
      marketMinPrice: td.marketMinPrice,
      marketMaxPrice: td.marketMaxPrice,
      numCreatorTokens: td.numCreatorTokens,
      numCreatorShares: td.numCreatorShares,
      numFillerTokens: td.numFillerTokens,
      numFillerShares: td.numFillerShares,
    })).toEqual(td.expectedVolume);
  });
});

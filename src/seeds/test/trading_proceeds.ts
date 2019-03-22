import * as Knex from "knex";

exports.seed = async (knex: Knex): Promise<any> => {
  // Deletes ALL existing entries
  return knex("trading_proceeds").del().then(async (): Promise<any> => {
    // Inserts seed entries
    const seedData = [{
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000D00",
      logIndex: 0,
      account: "0x0000000000000000000000000000000000000b0c",
      marketId: "0x0000000000000000000000000000000000000011",
      blockNumber: 1400001,
      shareToken: "0x480791cb5aa266e023198f2fdb90872b7da08c2e",
    }];
    return knex.batchInsert("trading_proceeds", seedData, seedData.length);
  });
};

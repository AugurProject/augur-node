import * as Knex from "knex";
import { ProfitLossTimeseriesRow } from "../../server/getters/get-profit-loss";

exports.seed = async (knex: Knex): Promise<any> => {
  // Deletes ALL existing entries
  return knex("wcl_profit_loss_timeseries").del().then(async (): Promise<any> => {
    // Inserts seed entries
    const seedData: Array<ProfitLossTimeseriesRow<string>> = [{
      timestamp: 0,
      account: "0x0000000000000000000000000000000000000b0b",
      marketId: "0x0000000000000000000000000000000000000001",
      outcome: 0,
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000A00",
      price: "7",
      position: "8",
      quantityOpened: "-5",
      profit: "12",
      realizedCost: "32",
      frozenFunds: "1.6",
      blockNumber: 1400001,
      logIndex: 0,
    }];
    return knex.batchInsert("wcl_profit_loss_timeseries", seedData, seedData.length);
  });
};

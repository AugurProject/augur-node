import * as Knex from "knex";

exports.seed = async (knex: Knex): Promise<any> => {
  // Deletes ALL existing entries
  return knex("reporting_windows").del().then(async (): Promise<any> => {
    // Inserts seed entries
    const seedData = [{
      reportingWindow: "0x1000000000000000000000000000000000000000",
      fees: 0,
    }];
    return knex.batchInsert("reporting_windows", seedData, seedData.length);
  });
};

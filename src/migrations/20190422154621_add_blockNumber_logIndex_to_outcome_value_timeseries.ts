import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  const addBlockNumber = knex.schema.hasColumn("outcome_value_timeseries", "blockNumber").then(async (exists) => {
    if (!exists) await knex.schema.table("outcome_value_timeseries", (t) => t.specificType("blockNumber", "integer NOT NULL DEFAULT 0 CONSTRAINT nonnegativeBlockNumber CHECK (\"blockNumber\" >= 0)"));
  });
  const addLogIndex = knex.schema.hasColumn("outcome_value_timeseries", "logIndex").then(async (exists) => {
    if (!exists) await knex.schema.table("outcome_value_timeseries", (t) => t.specificType("logIndex", "integer NOT NULL DEFAULT 0 CONSTRAINT nonnegativeLogIndex CHECK (\"logIndex\" >= 0)"));
  });
  return Promise.all([addBlockNumber, addLogIndex]);
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.table("outcome_value_timeseries", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("blockNumber");
    table.dropColumn("logIndex");
  });
};

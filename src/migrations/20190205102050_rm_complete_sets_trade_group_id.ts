import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.table("completeSets", (table: Knex.CreateTableBuilder): void => {
    table.dropColumns("tradeGroupId");
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.table("completeSets", (table: Knex.CreateTableBuilder): void => {
    table.integer("tradeGroupId");
  });
};

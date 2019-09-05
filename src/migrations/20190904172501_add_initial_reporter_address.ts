import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.hasColumn("markets", "initialReporterAddress").then(async(exists) => {
    if (!exists) {
      await knex.schema.table("markets", (table: Knex.CreateTableBuilder) => {
        table.specificType("initialReporterAddress", "varchar(255)");
      });
    }
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.table("markets", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("initialReporterAddress");
  });
};
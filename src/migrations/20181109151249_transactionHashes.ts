import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("transaction_hashes").then(async (): Promise<any> => {
    return knex.schema.createTable("transaction_hashes", (table: Knex.CreateTableBuilder): void => {
      table.string("transactionHash", 66).primary().notNullable();
      table.integer("blockNumber").notNullable();
      table.boolean("removed").defaultTo(0);
    });
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("transaction_hashes");
};

import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("pending_liquidity_updates").then((): PromiseLike<any> => {
    return knex.schema.createTable("pending_liquidity_updates", (table: Knex.CreateTableBuilder): void => {
      table.string("marketId", 42).notNullable();
    });
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("pending_liquidity_updates");
};

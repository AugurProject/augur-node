import * as Knex from "knex";

const OLD_TABLE_NAME = "transactionHashes";
const NEW_TABLE_NAME = "transaction_hashes";

exports.up = async (knex: Knex): Promise<any> => {
  if (await knex.schema.hasTable(OLD_TABLE_NAME)) {
    return knex.schema.renameTable(OLD_TABLE_NAME, NEW_TABLE_NAME);
  }
};

exports.down = async (knex: Knex): Promise<any> => {
  if (await knex.schema.hasTable(NEW_TABLE_NAME)) {
    return knex.schema.renameTable(NEW_TABLE_NAME, OLD_TABLE_NAME);
  }
};

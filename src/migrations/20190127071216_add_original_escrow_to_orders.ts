import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.hasColumn("orders", "originalTokensEscrowed").then(async(exists) => {
    if (!exists) {
      await knex.schema.table("orders", (table: Knex.CreateTableBuilder) => {
        table.specificType("originalTokensEscrowed", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeOriginalTokensEscrowed CHECK (ltrim(\"originalTokensEscrowed\", '-') = \"originalTokensEscrowed\")");
        table.specificType("originalSharesEscrowed", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeOriginalSharesEscrowed CHECK (ltrim(\"originalSharesEscrowed\", '-') = \"originalSharesEscrowed\")");
      });
    }
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.table("orders", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("originalTokensEscrowed");
    table.dropColumn("originalSharesEscrowed");
  });
};

import * as Knex from "knex";
import { updateSpreadPercentForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  const addSpreadPercentToMarkets = knex.schema.hasColumn("markets", "spreadPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("markets", (t) => t.specificType("spreadPercent", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeSpreadPercent CHECK (ltrim(\"spreadPercent\", '-') = \"spreadPercent\")"));
  });
  const addSpreadPercentToOutcomes = knex.schema.hasColumn("outcomes", "spreadPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("outcomes", (t) => t.specificType("spreadPercent", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeSpreadPercent CHECK (ltrim(\"spreadPercent\", '-') = \"spreadPercent\")"));
  });
  return Promise.all([addSpreadPercentToMarkets, addSpreadPercentToOutcomes])
    .then(async () => {
      for (const { marketId } of await knex.select("marketId").from("markets")) {
        await updateSpreadPercentForMarketAndOutcomes(knex, marketId);
      }
    });
};

exports.down = async (knex: Knex): Promise<any> => Promise.all([
  knex.schema.table("markets", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("spreadPercent");
  }),
  knex.schema.table("outcomes", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("spreadPercent");
  }),
],
);

import * as Knex from "knex";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  const addSpreadPercentToMarkets = knex.schema.hasColumn("markets", "spreadPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("markets", (t) => t.specificType("spreadPercent", "varchar(255) NOT NULL DEFAULT '1' CONSTRAINT nonnegativeSpreadPercent CHECK (ltrim(\"spreadPercent\", '-') = \"spreadPercent\")")); // default to 1 to represent 100% spread for markets/outcomes that never had any orders
  });
  const addSpreadPercentToOutcomes = knex.schema.hasColumn("outcomes", "spreadPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("outcomes", (t) => t.specificType("spreadPercent", "varchar(255) NOT NULL DEFAULT '1' CONSTRAINT nonnegativeSpreadPercent CHECK (ltrim(\"spreadPercent\", '-') = \"spreadPercent\")")); // default to 1 to represent 100% spread for markets/outcomes that never had any orders
  });
  return Promise.all([addSpreadPercentToMarkets, addSpreadPercentToOutcomes])
    .then(async () => {
      for (const { marketId } of await knex.select("marketId").from("markets")) {
        await updateLiquidityMetricsForMarketAndOutcomes(knex, marketId);
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

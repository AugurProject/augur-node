import * as Knex from "knex";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  const addInvalidROIPercentToMarkets = knex.schema.hasColumn("markets", "invalidROIPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("markets", (t) => t.specificType("invalidROIPercent", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeInvalidROIPercent CHECK (ltrim(\"invalidROIPercent\", '-') = \"invalidROIPercent\")"));
  });
  const addInvalidROIPercentToOutcomes = knex.schema.hasColumn("outcomes", "invalidROIPercent").then(async (exists) => {
    if (!exists) await knex.schema.table("outcomes", (t) => t.specificType("invalidROIPercent", "varchar(255) NOT NULL DEFAULT '0' CONSTRAINT nonnegativeInvalidROIPercent CHECK (ltrim(\"invalidROIPercent\", '-') = \"invalidROIPercent\")"));
  });
  return Promise.all([addInvalidROIPercentToMarkets, addInvalidROIPercentToOutcomes])
    .then(async () => {
      // may throw if this migration is being run on a newer version of the code
      try {
        for (const { marketId } of await knex.select("marketId").from("markets")) {
          await updateLiquidityMetricsForMarketAndOutcomes(knex, marketId);
        }
      } catch {
        console.info("**************************************************************************************************\n***** you can safely ignore these SQLITE errors which may occur normally during DB migration *****\n**************************************************************************************************");
      }
    });
};

exports.down = async (knex: Knex): Promise<any> => Promise.all([
  knex.schema.table("markets", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("invalidROIPercent");
  }),
  knex.schema.table("outcomes", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("invalidROIPercent");
  }),
],
);

import * as Knex from "knex";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.hasColumn("markets", "bestBidTakerInvalidProfitTokens")
    .then(async (exists) => {
      if (!exists) await knex.schema.table("markets", (t) => t.specificType("bestBidTakerInvalidProfitTokens", "varchar(255) NOT NULL DEFAULT '0'"));
    })
    .then(() => knex.schema.hasColumn("markets", "bestAskTakerInvalidProfitTokens"))
    .then(async (exists) => {
      if (!exists) await knex.schema.table("markets", (t) => t.specificType("bestAskTakerInvalidProfitTokens", "varchar(255) NOT NULL DEFAULT '0'"));
    })
    .then(() => knex.schema.hasColumn("outcomes", "bestBidTakerInvalidProfitTokens"))
    .then(async (exists) => {
      if (!exists) await knex.schema.table("outcomes", (t) => t.specificType("bestBidTakerInvalidProfitTokens", "varchar(255) NOT NULL DEFAULT '0'"));
    })
    .then(() => knex.schema.hasColumn("outcomes", "bestAskTakerInvalidProfitTokens"))
    .then(async (exists) => {
      if (!exists) await knex.schema.table("outcomes", (t) => t.specificType("bestAskTakerInvalidProfitTokens", "varchar(255) NOT NULL DEFAULT '0'"));
    })
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
    table.dropColumn("bestBidTakerInvalidProfitTokens");
    table.dropColumn("bestAskTakerInvalidProfitTokens");
  }),
  knex.schema.table("outcomes", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("bestBidTakerInvalidProfitTokens");
    table.dropColumn("bestAskTakerInvalidProfitTokens");
  }),
]);

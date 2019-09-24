import * as Knex from "knex";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("outcomes_liquidity")
    .then(() => knex.schema.createTable("outcomes_liquidity", (table: Knex.CreateTableBuilder): void => {
      table.string("marketId", 42).notNullable();
      table.specificType("outcome", "integer NOT NULL CONSTRAINT nonnegativeOutcome CHECK (\"outcome\" >= 0)");
      table.specificType("spreadPercent", "varchar(255) NOT NULL CONSTRAINT \"nonnegativeSpreadPercent\" CHECK (ltrim(\"spreadPercent\", '-') = \"spreadPercent\")");
      table.specificType("liquidityTokens", "varchar(255) NOT NULL CONSTRAINT \"nonnegativeLiquidityTokens\" CHECK (ltrim(\"liquidityTokens\", '-') = \"liquidityTokens\")");
      table.primary(["marketId", "outcome", "spreadPercent"]);
    }))
    .then(() => knex.raw("DROP VIEW IF EXISTS markets_liquidity"))
    // NB in markets_liquidity view we need liquidityTokens to retain its type as varchar(255) or else it won't be properly converted to a BigNumber by postProcessDatabaseResults
    .then(() => knex.raw(`CREATE VIEW markets_liquidity AS
      SELECT * FROM (
        SELECT marketId, spreadPercent, cast(sum(cast(liquidityTokens as real)) as text) as liquidityTokens
        FROM outcomes_liquidity
        GROUP BY marketId, spreadPercent
      )`))
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

exports.down = async (knex: Knex): Promise<any> => {
  return knex.raw("DROP VIEW markets_liquidity")
    .then(() => knex.schema.dropTableIfExists("outcomes_liquidity"));
};

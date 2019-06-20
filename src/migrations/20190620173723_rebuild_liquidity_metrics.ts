import * as Knex from "knex";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

exports.up = async (knex: Knex): Promise<any> => {
  try {
    for (const { marketId } of await knex.select("marketId").from("markets")) {
      await updateLiquidityMetricsForMarketAndOutcomes(knex, marketId);
    }
  } catch {
    console.info("**************************************************************************************************\n***** you can safely ignore these SQLITE errors which may occur normally during DB migration *****\n**************************************************************************************************");
  }
};

exports.down = async (knex: Knex): Promise<any> => {
  return Promise.resolve();
};

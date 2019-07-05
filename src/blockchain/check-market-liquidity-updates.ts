import * as Knex from "knex";
import { logger } from "../utils/logger";
import { updateLiquidityMetricsForMarketAndOutcomes } from "../utils/liquidity";

export async function checkMarketLiquidityUpdates(db: Knex) {
  const marketIdRows: Array<{marketId: string}> = await db.select().from("pending_liquidity_updates");
  let marketsToCheck = marketIdRows.length;
  if (marketsToCheck < 1) return;
  logger.info(`Need to update liquidity metrics for ${marketsToCheck} markets`);
  for (const marketIdRow of marketIdRows) {
    await db.transaction(async (trx: Knex.Transaction) => {
      await updateLiquidityMetricsForMarketAndOutcomes(trx, marketIdRow.marketId);
      await trx.from("pending_liquidity_updates").where({marketId: marketIdRow.marketId}).del();
    });
    marketsToCheck--;
    logger.info(`Need to update liquidity metrics for ${marketsToCheck} markets`);
  }
}

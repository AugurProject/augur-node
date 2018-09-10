import * as Knex from "knex";
import * as _ from "lodash";
import { ZERO } from "../constants";

interface MinimalTradeRow {
  price: BigNumber;
  amount: BigNumber;
  marketId: string;
  outcome: number;
}

function getMarketOutcomeVolumes(marketOutcomes: Array<MinimalTradeRow>) {
  return _.reduce(marketOutcomes, (acc, trade) => {
    return {
      shareVolume: acc.shareVolume.plus(trade.amount),
      volume: acc.volume.plus(trade.amount.multipliedBy(trade.price)),
    };
  }, { shareVolume: ZERO, volume: ZERO });
}

exports.up = async (knex: Knex): Promise<any> => {
  const marketShareVolumeCreated = await knex.schema.hasColumn("markets", "shareVolume").then(async(exists) => {
    if (exists) return false;
    await knex.schema.table("markets", (t) => t.string("shareVolume").defaultTo("0"));
    return true;
  });
  const outcomeShareVolumeCreated = await knex.schema.hasColumn("outcomes", "shareVolume").then(async(exists) => {
    if (exists) return false;
    await knex.schema.table("outcomes", (t) => t.string("shareVolume").defaultTo("0"));
    return true;
  });

  if (marketShareVolumeCreated || outcomeShareVolumeCreated) {
    const tradeRows: Array<MinimalTradeRow> = await knex("trades").select(["price", "amount", "marketId", "outcome"]);
    const tradeRowsGroupedByMarketOutcome = _.groupBy(tradeRows, (row) => `${row.marketId}-${row.outcome}` );
    for (const marketOutcome in tradeRowsGroupedByMarketOutcome) {
      const marketOutcomeVolumes = getMarketOutcomeVolumes(tradeRowsGroupedByMarketOutcome[marketOutcome]);
      const updateVolumeData = {
        volume: marketOutcomeVolumes.volume.toString(),
        shareVolume: marketOutcomeVolumes.shareVolume.toString(),
      };
      const marketIdAndOutcome = _.pick(tradeRowsGroupedByMarketOutcome[marketOutcome][0], ["marketId", "outcome"]);
      await knex("outcomes").update(updateVolumeData).where(marketIdAndOutcome);
    }
  }

};

exports.down = async (knex: Knex): Promise<any> => {
  await knex.schema.table("markets", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("shareVolume");
  });
  return knex.schema.table("outcomes", (table: Knex.CreateTableBuilder): void => {
    table.dropColumn("shareVolume");
  });
};

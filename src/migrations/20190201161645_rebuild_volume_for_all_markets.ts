import * as Knex from "knex";
import { rebuildVolumeForAllMarkets } from "../blockchain/rebuild-volume-for-all-markets";

// A recent fix to volume requires a full DB rebuild, so instead
// we're doing a migration to rebuild volume for all markets.

exports.up = async (db: Knex): Promise<any> => {
  await rebuildVolumeForAllMarkets(db, { manualPostProcessDatabaseResults: true }); // manualPostProcessDatabaseResults==true because Knex invoked via migration doesn't have postProcessDatabaseResults setup
};

exports.down = async (db: Knex): Promise<any> => {

};

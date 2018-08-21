import * as Knex from "knex";
// @ts-ignore
import * as environments from "../../knexfile.js";

import { postProcessDatabaseResults } from "../../src/server/post-process-database-results";
import { GenericCallback } from "../../src/types";

export const setupTestDb = (callback: GenericCallback<Knex>) => {
  const env = Object.assign({}, environments.test, {
    postProcessResponse: postProcessDatabaseResults,
  });
  const db = Knex(env);
  db.migrate.latest().then(() => {
    db.seed.run().then(() => {
      callback(null, db);
    });
  }).catch(callback);
};

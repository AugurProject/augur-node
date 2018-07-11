import * as Knex from "knex";

exports.up = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("completeSets").then((): PromiseLike<any> => {
    return knex.schema.raw(`CREATE TABLE completeSets (
      "transactionHash" varchar(66) NOT NULL,
      "logIndex" integer NOT NULL CONSTRAINT "nonnegativeCompleteSetsLogIndex" CHECK ("logIndex" >= 0),
      account varchar(66) NOT NULL,
      marketId varchar(66) NOT NULL,
      tradeGroupId integer,
      numCompleteSets varchar(255) NOT NULL CONSTRAINT nonnegativeNumCompleteSets CHECK ("numCompleteSets" > 0),
      numPurchasedOrSold varchar(255) NOT NULL CONSTRAINT nonnegativeNumPurchasedOrSold CHECK ("numPurchasedOrSold" > 0),
      "blockNumber" integer NOT NULL CONSTRAINT "positiveCompleteSetsBlockNumber" CHECK ("blockNumber" > 0),
      UNIQUE("transactionHash", "logIndex")
    )`);
  });
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("completeSets");
};

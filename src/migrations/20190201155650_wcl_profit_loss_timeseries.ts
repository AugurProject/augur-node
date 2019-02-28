import * as Knex from "knex";
import { Address } from "../types";
import { updateProfitLoss, updateProfitLossClaimProceeds } from "../blockchain/log-processors/profit-loss/update-profit-loss";

interface TradeOrClaimRow {
  marketId: string;
  outcome: number;
  amount: BigNumber;
  price: BigNumber;
  orderType: string;
  creator: Address;
  filler: Address;
  claim: boolean;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  numCreatorTokens: BigNumber;
  numCreatorShares: BigNumber;
  numFillerTokens: BigNumber;
  numFillerShares: BigNumber;
}

exports.up = async (knex: Knex): Promise<any> => {
  await knex.schema.dropTableIfExists("wcl_profit_loss_timeseries");

  await knex.schema.createTable("wcl_profit_loss_timeseries", (table: Knex.CreateTableBuilder): void => {
    table.string("account", 42).notNullable();
    table.string("marketId", 42).notNullable();
    table.specificType("outcome", "integer NOT NULL CONSTRAINT nonnegativeOutcome CHECK (\"outcome\" >= 0)");
    table.specificType("price", "varchar(255) NOT NULL CONSTRAINT nonnegativeAmount CHECK (ltrim(\"price\", '-') = \"price\")");
    table.string("position", 42).notNullable();
    table.string("profit", 255).defaultTo("0");
    table.string("frozenFunds", 255).defaultTo("0");
    table.string("transactionHash", 66).notNullable();
    table.specificType("timestamp", "integer NOT NULL CONSTRAINT nonnegativeTimestamp CHECK (\"timestamp\" >= 0)");
    table.specificType("logIndex", "integer NOT NULL CONSTRAINT \"nonnegativelogIndex\" CHECK (\"logIndex\" >= 0)");
    table.specificType("blockNumber", "integer NOT NULL CONSTRAINT positiveOrderBlockNumber CHECK (\"blockNumber\" > 0)");
  });

  const query = knex("trades")
    .select(knex.raw([`"marketId"`, "outcome", "amount", "price", `"orderType"`, "creator", "filler", "false as claim", `"blockNumber"`, `"logIndex"`, `"transactionHash", "numCreatorTokens", "numCreatorShares", "numFillerTokens", "numFillerShares"`]))
    .union((builder: Knex.QueryBuilder) => {
      return builder
        .from("trading_proceeds")
        .select(knex.raw([
          `"marketId"`, // TradeOrClaimRow.marketId
          "0", // TradeOrClaimRow.outcome
          "'0'", // TradeOrClaimRow.amount
          "'0'", // TradeOrClaimRow.price
          "'0'", // TradeOrClaimRow.orderType
          "''", // TradeOrClaimRow.creator
          "account", // TradeOrClaimRow.filler NB row.filler passed as `account` below
          "true as claim", // TradeOrClaimRow.claim
          `"blockNumber"`,
          `"logIndex"`,
          `"transactionHash"`,
          "'0'", // TradeOrClaimRow.numCreatorTokens
          "'0'", // TradeOrClaimRow.numCreatorShares
          "'0'", // TradeOrClaimRow.numFillerTokens
          "'0'", // TradeOrClaimRow.numFillerShares
        ]));
    });
  query.orderByRaw(`"blockNumber", "logIndex"`);

  const results: Array<TradeOrClaimRow> = await query;

  for (const row of results) {
    if (row.claim) {
      await updateProfitLossClaimProceeds(knex, row.marketId, row.filler, row.transactionHash, row.blockNumber, row.logIndex);
    } else {
      await updateProfitLoss(knex, row.marketId, row.orderType === "buy" ? row.amount : row.amount.negated(), row.creator, row.outcome, row.price, row.transactionHash, row.blockNumber, row.logIndex, row);
      await updateProfitLoss(knex, row.marketId, row.orderType === "sell" ? row.amount : row.amount.negated(), row.filler, row.outcome, row.price, row.transactionHash, row.blockNumber, row.logIndex, row);
    }
  }

  await knex.schema.dropTableIfExists("profit_loss_timeseries");
};

exports.down = async (knex: Knex): Promise<any> => {
  return knex.schema.dropTableIfExists("wcl_profit_loss_timeseries");
};

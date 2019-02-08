import { Augur } from "augur.js";
import * as Knex from "knex";
import { BigNumber } from "bignumber.js";
import { Address, FormattedEventLog } from "../../../types";
import { isLegacyReputationToken } from "./is-legacy-reputation-token";

interface BalanceResult {
  balance: BigNumber;
}

export async function increaseTokenBalance(db: Knex, augur: Augur, token: Address, owner: Address, amount: BigNumber, log: FormattedEventLog) {
  if (isLegacyReputationToken(augur, token)) return;
  const oldBalance: BalanceResult = await db.first("balance").from("balances").where({ token, owner });
  let balance = amount;
  if (oldBalance == null) {
    await db.insert({ owner, token, balance: balance.toString() }).into("balances");
  } else {
    balance = oldBalance.balance.plus(amount);
    await db.update({ balance: balance.toString() }).into("balances").where({ token, owner });
  }
}

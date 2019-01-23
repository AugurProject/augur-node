import Augur from "augur.js";
import * as Knex from "knex";
import { promisify } from "util";
import { downloadAugurLogs } from "./download-augur-logs";
import { augurEmitter } from "../events";
import { logger } from "../utils/logger";
import { SubscriptionEventNames } from "../constants";
import { delay } from "bluebird";

const BLOCKSTREAM_HANDOFF_BLOCKS = 5;
const BLOCKSTREAM_HANDOFF_WAIT_TIME_MS = 15000;
let syncFinished = false;

interface HighestBlockNumberRow {
  highestBlockNumber: number;
}

export function isSyncFinished() {
  return syncFinished;
}

function setSyncFinished() {
  syncFinished = true;
  augurEmitter.emit(SubscriptionEventNames.SyncFinished);
}

export async function bulkSyncAugurNodeWithBlockchain(db: Knex, augur: Augur, blocksPerChunk: number | undefined): Promise<number> {
  await waitForEthNodeToFinishSyncing(augur);
  const row: HighestBlockNumberRow | null = await db("blocks").max("blockNumber as highestBlockNumber").first();
  const lastSyncBlockNumber: number | null | undefined = row!.highestBlockNumber;
  const uploadBlockNumber: number = augur.contracts.uploadBlockNumbers[augur.rpc.getNetworkID()] || 0;
  let highestBlockNumber: number = await getHighestBlockNumber(augur);
  let fromBlock: number;
  if (uploadBlockNumber > highestBlockNumber) {
    logger.info(`Synchronization started at (${uploadBlockNumber}), which exceeds the current block from the ethereum node (${highestBlockNumber}), starting from 0 instead`);
    fromBlock = 0;
  } else {
    fromBlock = lastSyncBlockNumber == null ? uploadBlockNumber : lastSyncBlockNumber + 1;
  }
  let handoffBlockNumber = highestBlockNumber - BLOCKSTREAM_HANDOFF_BLOCKS;
  let skipBulkDownload = false;
  while (handoffBlockNumber < fromBlock) {
    skipBulkDownload = true;
    logger.warn(`The Ethereum node has not processed enough blocks (${BLOCKSTREAM_HANDOFF_BLOCKS}) since last sync
    Current Block: ${highestBlockNumber}
    Last Sync Block: ${fromBlock}
    Blocks to wait: ${BLOCKSTREAM_HANDOFF_BLOCKS - (highestBlockNumber - fromBlock)}`);
    await delay(BLOCKSTREAM_HANDOFF_WAIT_TIME_MS);
    highestBlockNumber = await getHighestBlockNumber(augur);
    handoffBlockNumber = highestBlockNumber - BLOCKSTREAM_HANDOFF_BLOCKS;
  }
  if (skipBulkDownload) {
    logger.info(`Skipping batch load`);
    setSyncFinished();
    return fromBlock - 1;
  }
  await promisify(downloadAugurLogs)(db, augur, fromBlock, handoffBlockNumber, blocksPerChunk);
  setSyncFinished();
  await db.insert({ highestBlockNumber }).into("blockchain_sync_history");
  logger.info(`Finished batch load from ${fromBlock} to ${handoffBlockNumber}`);
  return handoffBlockNumber;
}

async function getHighestBlockNumber(augur: Augur): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    augur.rpc.eth.blockNumber(null, (error, blockNumber: string) => {
      if (error) reject("Couldn't get block number");
      resolve(parseInt(blockNumber.toString(), 16));
    });
  });
}

async function waitForEthNodeToFinishSyncing(augur: Augur): Promise<void> {
  while (true) {
    const sync = await getIsEthNodeSyncing(augur);
    if (!sync.isEthNodeSyncing) break;
    logger.warn(`The Ethereum node has not finished syncing, waiting
    Current Block: ${sync.highestBlockNumber}`);
    await delay(BLOCKSTREAM_HANDOFF_WAIT_TIME_MS);
  }
}

async function getIsEthNodeSyncing(augur: Augur): Promise<{
  highestBlockNumber: number;
  isEthNodeSyncing: boolean;
}> {
  const getHighestBlockNumberPromise = getHighestBlockNumber(augur);
  const syncingPromise = new Promise<any>((resolve, reject) => {
    augur.rpc.eth.syncing(null, (error, response: any) => {
      if (error) reject(`isEthNodeSyncing eth_syncing failed: ${error}\n${error.stack || ""}`);
      resolve(response);
    });
  });
  const syncingResult = await syncingPromise;
  const highestBlockNumber = await getHighestBlockNumberPromise;

  // The problem here is that eth_syncing will return false both when
  // the node is fully synced and when it has not yet begun syncing.
  // We'll mitigate this by defining an eth node with highestBlockNumber
  // zero (ie. new DB) as syncing even if eth_syncing returns false.
  const isEthNodeSyncing: boolean = syncingResult !== false || highestBlockNumber === 0;

  return {
    highestBlockNumber,
    isEthNodeSyncing,
  };
}

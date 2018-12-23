import Augur from "augur.js";
import * as Knex from "knex";
import { EventEmitter } from "events";
import { NetworkConfiguration } from "augur-core";
import { runServer, RunServerResult, shutdownServers } from "./server/run-server";
import { bulkSyncAugurNodeWithBlockchain } from "./blockchain/bulk-sync-augur-node-with-blockchain";
import { startAugurListeners } from "./blockchain/start-augur-listeners";
import { createDbAndConnect, renameBulkSyncDatabaseFile } from "./setup/check-and-initialize-augur-db";
import { clearOverrideTimestamp } from "./blockchain/process-block";
import { ConnectOptions, ErrorCallback } from "./types";
import { ControlMessageType, DB_VERSION, DB_FILE } from "./constants";
import { logger } from "./utils/logger";
import { LoggerInterface } from "./utils/logger/logger";
import { BlockAndLogsQueue } from "./blockchain/block-and-logs-queue";
import { fileCompatible, getFileHash } from "./sync/file-operations";
import { BackupRestore } from "./sync/backup-restore";

export interface SyncedBlockInfo {
  lastSyncBlockNumber: number;
  uploadBlockNumber: number;
  highestBlockNumber: number;
}

export class AugurNodeController {
  private augur: Augur;
  private networkConfig: NetworkConfiguration;
  private databaseDir: string | undefined;
  private running: boolean;
  private controlEmitter: EventEmitter;
  private db: Knex | undefined;
  private serverResult: RunServerResult | undefined;
  private errorCallback: ErrorCallback | undefined;
  private logger = logger;
  private blockAndLogsQueue: BlockAndLogsQueue | undefined;

  constructor(augur: Augur, networkConfig: ConnectOptions, databaseDir?: string) {
    this.augur = augur;
    this.networkConfig = networkConfig;
    this.databaseDir = databaseDir;
    this.running = false;
    this.controlEmitter = new EventEmitter();
  }

  public async start(errorCallback: ErrorCallback | undefined) {
    this.running = true;
    this.errorCallback = errorCallback;
    try {
      this.db = await createDbAndConnect(errorCallback, this.augur, this.networkConfig, this.databaseDir);
      this.controlEmitter.emit(ControlMessageType.BulkSyncStarted);
      this.serverResult = runServer(this.db, this.augur, this.controlEmitter);
      const handoffBlockNumber = await bulkSyncAugurNodeWithBlockchain(this.db, this.augur);
      this.controlEmitter.emit(ControlMessageType.BulkSyncFinished);
      this.logger.info("Bulk sync with blockchain complete.");
      this.blockAndLogsQueue = startAugurListeners(this.db, this.augur, handoffBlockNumber + 1, this._shutdownCallback.bind(this));
    } catch (err) {
      if (this.errorCallback) this.errorCallback(err);
    }
  }

  public async warpSync(filename: string, errorCallback: ErrorCallback | undefined) {
    try {
      if (this.isRunning()) await this.shutdown();
      if (filename.startsWith(getFileHash(filename))) {
        const networkId = this.augur.rpc.getNetworkID();
        if (fileCompatible(filename, networkId, DB_VERSION)) {
          BackupRestore.import(DB_FILE, networkId, DB_VERSION, filename);
        } else if (errorCallback) {
          errorCallback(new Error(`sync file not compatible with current network: ${networkId}`));
        }
      } else if (errorCallback) {
        errorCallback(new Error("file hash is different to file contents hash"));
      }
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  }

  public async shutdown() {
    try {
      await this._shutdown();
    } catch (err) {
      if (this.errorCallback) this.errorCallback(err);
    }
  }

  public isRunning() {
    return this.running && this.db != null;
  }

  public async requestLatestSyncedBlock(): Promise<SyncedBlockInfo> {
    if (!this.running || this.db == null) throw new Error("Not running");
    const row: { highestBlockNumber: number } = await this.db("blocks")
      .max("blockNumber as highestBlockNumber")
      .first();
    const lastSyncBlockNumber = row.highestBlockNumber;
    const currentBlock = this.augur.rpc.getCurrentBlock();
    if (currentBlock === null) {
      throw new Error("No Current Block");
    }
    const highestBlockNumber = parseInt(this.augur.rpc.getCurrentBlock().number, 16);
    const uploadBlockNumber = this.augur.contracts.uploadBlockNumbers[this.augur.rpc.getNetworkID()];
    return { lastSyncBlockNumber, uploadBlockNumber, highestBlockNumber };
  }

  public async resetDatabase(id: string, errorCallback: ErrorCallback | undefined) {
    let networkId = id || "1";
    try {
      if (this.augur != null && this.augur.rpc.getNetworkID()) {
        networkId = this.augur.rpc.getNetworkID();
      }
      if (this.isRunning()) await this._shutdown();
      await renameBulkSyncDatabaseFile(networkId, this.databaseDir);
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  }

  public addLogger(logger: LoggerInterface) {
    this.logger.addLogger(logger);
  }

  public clearLoggers() {
    this.logger.clear();
  }

  private _shutdownCallback(err: Error | null) {
    if (err == null) return;
    this.logger.error("Fatal Error, shutting down servers", err);
    if (this.errorCallback) this.errorCallback(err);
    if (this.serverResult !== undefined) shutdownServers(this.serverResult.servers);
    process.exit(1);
  }

  private async _shutdown() {
    if (!this.running) return;
    this.running = false;
    this.logger.info("Stopping Augur Node Server");
    if (this.blockAndLogsQueue !== undefined) {
      this.blockAndLogsQueue.stop();
      this.blockAndLogsQueue = undefined;
    }
    if (this.serverResult !== undefined) {
      const servers = this.serverResult.servers;
      shutdownServers(servers);
      this.serverResult = undefined;
    }
    if (this.db !== undefined) {
      await this.db.destroy();
      this.db = undefined;
    }
    clearOverrideTimestamp();
    this.augur.disconnect();
    this.logger.clear();
  }
}

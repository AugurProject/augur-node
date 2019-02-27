import { promisify, format } from "util";
import * as _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import * as md5File from "md5-file";
import { logger } from "../utils/logger";
import { DB_WARP_SYNC_FILE_ENDING } from "../constants";
import * as Knex from "knex";

export function getFileHash(filename: string): string {
  return md5File.sync(filename);
}

export async function compressAndHashFile(dbFileName: string, networkId: string, dbVersion: number, syncfileTemplate: string, directoryDir: string = ".") {
  const fixedDbFilename = "__fixed_db_file__";
  await copyRunDbFixerScript(path.join(directoryDir, dbFileName), path.join(directoryDir, fixedDbFilename));
  const WARP_SYNC_FILE = "__temp_sync_file__";
  await createWarpSyncFile(path.join(directoryDir, fixedDbFilename), path.join(directoryDir, WARP_SYNC_FILE));
  await promisify(fs.unlink)(path.join(directoryDir, fixedDbFilename)); // remove temp fix db file
  const hash = getFileHash(path.join(directoryDir, WARP_SYNC_FILE));
  const syncFile = format(syncfileTemplate, hash, networkId, dbVersion);
  fs.renameSync(path.join(directoryDir, WARP_SYNC_FILE), path.join(directoryDir, syncFile));
  logger.info(format("create warp sync file %s", syncFile));
}

export async function restoreWarpSyncFile(dbFileNamePath: string, syncFilenameAbsPath: string): Promise<void> {
  logger.info(format("restore/import warp sync file %s", syncFilenameAbsPath));
  return new Promise<void>((resolve, reject) => {
    const bigger = zlib.createGunzip();
    const input = fs.createReadStream(syncFilenameAbsPath);
    const output = fs.createWriteStream(dbFileNamePath);

    input
      .pipe(bigger)
      .pipe(output)
      .on("error", (err: any) => {
        logger.error("Error: restoring warp sync file");
        reject(err);
      })
      .on("finish", () => {
        resolve();
      });
  });
}

export async function createWarpSyncFile(dbFileNamePath: string, syncFileNamePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const smaller = zlib.createGzip({ level: 9 });
    const input = fs.createReadStream(dbFileNamePath);
    const output = fs.createWriteStream(syncFileNamePath);

    input
      .pipe(smaller)
      .pipe(output)
      .on("error", (err: any) => {
        logger.error("Error: creating warp sync file");
        reject(err);
      })
      .on("finish", () => {
        resolve();
      });
  });
}

export function removeOldSyncFiles(networkId: string, dbVersion: number, directoryDir: string = ".") {
  const syncFiles = format(DB_WARP_SYNC_FILE_ENDING, networkId, dbVersion);
  const files = fs.readdirSync(directoryDir).filter((fn: string) => fn.endsWith(syncFiles));
  if (files) {
    _.each(files, (file) => fs.unlinkSync(path.join(directoryDir, file)));
  }
}

export function fileCompatible(filename: string, networkId: string, dbVersion: number): boolean {
  const compSyncfile = format(DB_WARP_SYNC_FILE_ENDING, networkId, dbVersion);
  return filename.endsWith(compSyncfile);
}

export function getHighestDbVersion(directoryDir: string, dbFileName: string): number {
  let version = 0;
  const files = fs.readdirSync(directoryDir).filter((fn: string) => fn.startsWith(dbFileName));
  if (files) {
    _.each(files, (file) => {
      const parts = file.split("-");
      if (parts.length > 2) {
        const fileVersion = parseInt(parts[2], 10);
        if (fileVersion > version) {
          version = fileVersion;
        }
      }
    });
  }
  return version;
}

async function copyRunDbFixerScript(dbFileNamePath: string, backupDbPath: string): Promise<void> {
  await promisify(fs.copyFile)(dbFileNamePath, backupDbPath);
  // need to do this because cli runs migrations in .ts and augur-app runs migrations in .js
  const db: Knex = Knex({
    client: "sqlite3",
    connection: {
      filename: backupDbPath,
    },
    acquireConnectionTimeout: 5 * 60 * 1000,
    useNullAsDefault: true,
  });
  await db.raw("update knex_migrations set name = substr(name,1, length(name)-2) || 'js';");
  await db.destroy();
}

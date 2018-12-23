import { format } from "util";
import * as _ from "lodash";
import * as fs from "fs";
import { DB_WARP_SYNC_FILE_ENDING } from "../constants";

export function getFileHash(filename: string): string {
  const md5File = require("md5-file");
  return md5File.sync(filename);
}

export async function compressAndHashFile(dbFileName: string, networkId: string, dbVersion: number, syncfileTemplate: string) {
  const WARP_SYNC_FILE = "__temp_sync_file__";
  await createWarpSyncFile(dbFileName, WARP_SYNC_FILE);
  const hash = getFileHash(WARP_SYNC_FILE);
  const syncFile = format(syncfileTemplate, hash, networkId, dbVersion);
  fs.renameSync(WARP_SYNC_FILE, syncFile);
}

export async function restoreWarpSyncFile(syncFilename: string, dbFileName: string) {
  return new Promise<any>((resolve, reject) => {
    const zlib = require("zlib");
    const bigger = zlib.createGunzip();
    const input = fs.createReadStream(syncFilename);
    const output = fs.createWriteStream(dbFileName);

    input
      .pipe(bigger)
      .pipe(output)
      .on("error", (err: any) => {
        console.error("Error: restoring warp sync file");
        reject(err);
      })
      .on("finish", () => {
        resolve();
      });
  });
}

export async function createWarpSyncFile(dbFileName: string, syncFilename: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const zlib = require("zlib");
    fs.closeSync(fs.openSync(syncFilename, "w"));
    const smaller = zlib.createGzip({ level: 9 });
    const input = fs.createReadStream(dbFileName);
    const output = fs.createWriteStream(syncFilename);

    input
      .pipe(smaller)
      .pipe(output)
      .on("error", (err: any) => {
        console.error("Error: creating warp sync file");
        reject(err);
      })
      .on("finish", () => {
        resolve();
      });
  });
}
export function removeOldSyncFiles(networkId: string, dbVersion: number) {
  const syncFiles = format(DB_WARP_SYNC_FILE_ENDING, networkId, dbVersion);

  const files = fs.readdirSync(".").filter((fn: string) => fn.endsWith(syncFiles));
  if (files) {
    _.each(files, (file) => fs.unlinkSync(file));
  }
}

export function fileCompatible(filename: string, networkId: string, dbVersion: number): boolean {
  const compSyncfile = format(DB_WARP_SYNC_FILE_ENDING, networkId, dbVersion);
  return filename.endsWith(compSyncfile);
}

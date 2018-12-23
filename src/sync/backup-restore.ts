import { removeOldSyncFiles, fileCompatible, restoreWarpSyncFile, compressAndHashFile } from "./file-operations";
import { format } from "util";

export class BackupRestore {
  public static async export(fileTemplate: string, networkId: string, dbVersion: number, syncfileTemplate: string) {
    const dbFileName = format(fileTemplate, networkId, dbVersion);

    removeOldSyncFiles(networkId, dbVersion);
    await compressAndHashFile(dbFileName, networkId, dbVersion, syncfileTemplate);
  }

  public static async import(fileTemplate: string, networkId: string, dbVersion: number, syncFilename: string) {
    const dbFileName = format(fileTemplate, networkId, dbVersion);
    if (fileCompatible(syncFilename, networkId, dbVersion)) {
      await restoreWarpSyncFile(syncFilename, dbFileName);
    }
  }
}

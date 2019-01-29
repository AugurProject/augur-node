import { removeOldSyncFiles, fileCompatible, restoreWarpSyncFile, compressAndHashFile } from "./file-operations";
import { format } from "util";
import * as path from "path";

export class BackupRestore {
  public static async export(fileTemplate: string, networkId: string, dbVersion: number, syncfileTemplate: string, directoryDir: string) {
    const dbFileName = format(fileTemplate, networkId, dbVersion);

    removeOldSyncFiles(networkId, dbVersion, directoryDir);
    await compressAndHashFile(dbFileName, networkId, dbVersion, syncfileTemplate, directoryDir);
  }

  public static async import(fileTemplate: string, networkId: string, dbVersion: number, syncFilename: string, directoryDir: string) {
    const dbFileName = format(fileTemplate, networkId, dbVersion);
    if (fileCompatible(syncFilename, networkId, dbVersion)) {
      await restoreWarpSyncFile(path.join(directoryDir, dbFileName), syncFilename);
    }
  }
}

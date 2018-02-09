import * as async from "async";
import { ErrorCallback } from "../types";

export const processQueue = async.priorityQueue((processFunction: (callback: ErrorCallback) => void, nextFunction: ErrorCallback): void => {
  processFunction(nextFunction);
}, 1);

export function blockPriority(blockNumber: number): number {
  return 2 * blockNumber;
}

export function logPriority(blockNumber: number): number {
  return blockPriority(blockNumber) + 1;
}
